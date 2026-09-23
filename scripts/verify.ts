/**
 * End-to-end check of the §5 state machine and the §3 review gates.
 * Runs against the seeded database and asserts on real state transitions.
 *
 *   npm run verify        (re-seeds first, so it is repeatable)
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { db, row, rows } from "../lib/db.ts";
import * as w from "../lib/workflow.ts";
import * as rep from "../lib/replacement.ts";
import { hospitalCatalogue, replacementFor, suggestionCards } from "../lib/queries.ts";
import { runSuggestions, block, dismissSuggestion } from "../lib/matching/suggest.ts";
import { searchProducts } from "../lib/search.ts";
import * as msg from "../lib/messaging.ts";
import { embeddingTag } from "../lib/matching/pipeline.ts";
import { cosine } from "../lib/db.ts";
import { HOSPITAL_ID, CLINICAL } from "../lib/constants.ts";
import { checkExtractSchema } from "./check-extract-schema.ts";

/**
 * Nothing is preloaded, so the run begins the way a real tenant does: upload a
 * manufacturer catalogue, then upload hospital demand.
 */
async function uploadFixtures() {
  const root = process.cwd();
  const files: [string, "supplier" | "hospital", string][] = [
    // The two real catalogues, then the synthetic spreadsheets that add the
    // Class IIb / III categories the supplied files do not contain.
    ["Produktkatalog.pdf", "supplier", "org_bbraun"],
    ["Produktkatalog 02.pdf", "supplier", "org_bd"],
    ["samples/manufacturer-bbraun-pumpsets.csv", "supplier", "org_bbraun"],
    ["samples/manufacturer-bd-pumpsets.csv", "supplier", "org_bd"],
    ["samples/manufacturer-medtronic.csv", "supplier", "org_medtronic"],
    ["samples/manufacturer-smith-nephew.csv", "supplier", "org_smithnephew"],
    ["Entwicklungsherausforderungen v01.xlsx", "hospital", ""],
    ["samples/hospital-hochrisiko-bedarf.csv", "hospital", ""],
  ];
  for (const [rel, kind, orgId] of files) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) { console.log(`  skip ${rel} (not present)`); continue; }
    const name = path.basename(rel);
    const bytes = readFileSync(abs);
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array(bytes)], name, { type: contentTypeFor(name) }));
    if (kind === "supplier") fd.set("supplierId", orgId);
    const res = kind === "supplier"
      ? await w.uploadSupplierCatalogue(fd)
      : await w.uploadHospitalDemand(fd);
    console.log(`  ${res.ok ? "ok  " : "FAIL"} upload ${name} — ${res.message}`);
    if (!res.ok) throw new Error(res.message);
  }

  // The BD PDF's numerals do not extract, so all of its rows land below the
  // threshold. Clearing a handful is what a manufacturer would actually do,
  // and it is what gives substitution a cross-brand candidate to work with.
  const pending = rows<{ id: string }>(
    `SELECT id FROM supplier_catalog_items WHERE supplier_id='org_bd' AND status='unchecked'
     ORDER BY extraction_confidence DESC LIMIT 12`);
  for (const r of pending) await w.confirmExtraction(r.id, "supplier");
  console.log(`  ok   supplier cleared ${pending.length} rows from its review queue`);

  // What an upload schedules after its response in the app. Substitution
  // recommendations are built from the pairs it matches.
  const s = await runSuggestions("verify uploads");
  console.log(`  ok   suggestion pipeline: ${s.pairsTotal} pairs → ${s.matched} matched`);
}

function contentTypeFor(name: string): string {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".csv")) return "text/csv";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}
function section(s: string) { console.log(`\n${s}`); }

async function main() {
  const conn = db();

  section("uploads — the platform starts empty");
  const before = rows<{ n: number }>(`SELECT COUNT(*) AS n FROM canonical_products`)[0].n;
  check("no canonical products before any upload", before === 0, `found ${before}`);
  await uploadFixtures();
  const afterUpload = rows<{ n: number }>(`SELECT COUNT(*) AS n FROM canonical_products`)[0].n;
  check("uploading a catalogue creates canonical products", afterUpload > 0);
  check("the uploaded file is stored verbatim",
    rows<{ n: number }>(`SELECT COUNT(*) AS n FROM source_documents WHERE file_bytes IS NOT NULL`)[0].n >= 2);
  check("hospital demand rows were extracted",
    rows<{ n: number }>(`SELECT COUNT(*) AS n FROM hospital_purchase_items`)[0].n > 0);

  // ---------------------------------------------------------------- §3 gates
  section("§3 — extraction and link gates");
  const unlinked = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM hospital_purchase_items WHERE status='unchecked'
       AND extraction_confidence >= 90`)[0];
  check("no item is 'unchecked' while above the extraction threshold", unlinked.n === 0);

  const belowFeeding = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recommendations r
     JOIN hospital_purchase_items h ON h.id = r.hospital_item_id
     WHERE h.extraction_confidence < 90`)[0];
  check("no recommendation is built on a below-threshold extraction", belowFeeding.n === 0);

  // Invariants first: whether a proposal happens to exist depends on the data,
  // but the relationship between confidence and status must always hold.
  const badConfirm = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM item_links
     WHERE status='confirmed' AND link_method IN ('reranked','llm_adjudicated') AND link_confidence < 95`)[0];
  check("no automatic link is confirmed below the 95 threshold", badConfirm.n === 0);

  const badProposal = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM item_links WHERE status='proposed' AND link_confidence >= 95`)[0];
  check("nothing at or above 95 is left sitting as a proposal", badProposal.n === 0);

  const orphanProposal = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM item_links WHERE status='proposed' AND canonical_product_id IS NULL`)[0];
  check("every proposal carries the candidate it is a proposal for", orphanProposal.n === 0);

  // Drive one through if the uploaded data produced one.
  const proposal = row<{ id: string; item_id: string; canonical_product_id: string; link_confidence: number }>(
    `SELECT l.id, l.item_id, l.canonical_product_id, l.link_confidence FROM item_links l
     JOIN hospital_purchase_items h ON h.id = l.item_id
     WHERE l.status='proposed' AND l.item_type='hospital' LIMIT 1`);
  if (proposal) {
    const recsBefore = rows<{ n: number }>(`SELECT COUNT(*) AS n FROM recommendations`)[0].n;
    await w.confirmLink(proposal.id);
    const item = row<{ status: string; canonical_product_id: string }>(
      `SELECT status, canonical_product_id FROM hospital_purchase_items WHERE id=?`, proposal.item_id);
    check("confirming a proposal links the item", item?.status === "linked");
    const recsAfter = rows<{ n: number }>(`SELECT COUNT(*) AS n FROM recommendations`)[0].n;
    check("confirming a proposal produces new recommendations",
      recsAfter > recsBefore, `${recsBefore} -> ${recsAfter}`);
    const logged = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM correction_log WHERE item_id=?`, proposal.item_id)[0];
    check("the correction is written to the audit log", logged.n > 0);
  } else {
    console.log("  --   no link proposal in this dataset; invariants checked instead");
  }

  section("harmonisation reaches across article-number mismatches");
  const sterican = row<{ status: string; canonical_product_id: string; extracted_sku: string }>(
    `SELECT status, canonical_product_id, extracted_sku FROM hospital_purchase_items
     WHERE extracted_name LIKE '%Sterican%' LIMIT 1`);
  if (sterican) {
    // The hospital's own article number does not match B. Braun's; only the
    // description does. This is the case the semantic layers exist for.
    const cp = row<{ canonical_name: string }>(
      `SELECT canonical_name FROM canonical_products WHERE id=?`, sterican.canonical_product_id ?? "");
    check("the Sterican row resolved despite a mismatched article number",
      sterican.status === "linked" && Boolean(cp),
      `sku ${sterican.extracted_sku} -> ${cp?.canonical_name ?? "unresolved"}`);
  }

  // ------------------------------------------------------- §2 clinical gate
  section("§2 — risk-weighted substitution gate");
  const classIII = row<{ id: string; requires_clinical_review: number; match_confidence: number }>(
    `SELECT r.id, r.requires_clinical_review, r.match_confidence FROM recommendations r
     JOIN canonical_products cp ON cp.id = r.recommended_canonical_product_id
     WHERE r.type='substitution' AND cp.mdr_risk_class='III' LIMIT 1`);
  check("a Class III substitution exists to test", Boolean(classIII));
  check("Class III substitution requires clinical review",
    classIII?.requires_clinical_review === 1);
  if (classIII) {
    const q = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM questions WHERE recommendation_id=? AND type='blocking'`, classIII.id)[0];
    check("Class III substitution ships with a blocking question regardless of confidence",
      q.n > 0, `confidence was ${classIII.match_confidence}`);
  }

  const identityClinical = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recommendations WHERE type='identity' AND requires_clinical_review=1`)[0];
  check("no identity match requires clinical review", identityClinical.n === 0);

  section("messages — one conversation per hospital and manufacturer");
  {
    const rec = row<{ id: string; supplier_id: string; status: string }>(
      `SELECT r.id, r.supplier_id, r.status FROM recommendations r WHERE r.status IN ('new','in_progress')
         AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.recommendation_id = r.id
                           AND q.type = 'blocking' AND q.status = 'open')
       ORDER BY CASE r.type WHEN 'identity' THEN 0 ELSE 1 END, r.created_at LIMIT 1`);
    check("a recommendation exists to ask about", Boolean(rec));
    if (rec) {
      const fd = new FormData();
      fd.set("recId", rec.id); fd.set("type", "blocking");
      fd.set("text", "Is the sterile barrier system the same as on the article we buy now?");
      await w.askQuestion(fd);
      const q = row<{ id: string; sent_at: string | null }>(
        `SELECT id, sent_at FROM questions WHERE recommendation_id=? AND text LIKE 'Is the sterile barrier%'`, rec.id)!;
      const card = row<{ id: string }>(`SELECT id FROM chat_messages WHERE question_id=?`, q.id);
      check("asking the supplier on a recommendation sends it into the conversation", Boolean(q.sent_at && card));
      check("the recommendation is blocked by it",
        row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, rec.id)?.status === "blocked");

      const inbox = msg.conversations("supplier", rec.supplier_id);
      const conv = inbox.find((c) => c.hospitalId === HOSPITAL_ID);
      check("the manufacturer sees one conversation with this hospital, with the question open and unread",
        inbox.filter((c) => c.hospitalId === HOSPITAL_ID).length === 1
          && (conv?.openQuestions ?? 0) >= 1 && (conv?.unread ?? 0) >= 1,
        JSON.stringify(conv));
      const t = msg.thread("supplier", HOSPITAL_ID, rec.supplier_id)!;
      const asked = t.messages.find((m) => m.question?.id === q.id)!;
      check("the question arrives as a card naming the product", asked.kind === "question"
        && Boolean(asked.question?.productName));

      msg.markRead("supplier", HOSPITAL_ID, rec.supplier_id);
      check("opening the conversation reads it",
        msg.conversations("supplier", rec.supplier_id).find((c) => c.hospitalId === HOSPITAL_ID)?.unread === 0);

      // A second open question: the answer must go to the one replied to.
      const other = rows<{ id: string }>(
        `SELECT DISTINCT question_id AS id FROM chat_messages WHERE hospital_id=? AND supplier_id=?
           AND question_id IS NOT NULL AND question_id != ?`, HOSPITAL_ID, rec.supplier_id, q.id)
        .find((x) => row<{ status: string }>(`SELECT status FROM questions WHERE id=?`, x.id)?.status === "open");
      msg.postMessage({ side: "supplier", hospitalId: HOSPITAL_ID, supplierId: rec.supplier_id,
        body: "Yes — same Tyvek pouch and the same EO sterilisation.", questionId: q.id });
      const answered = row<{ status: string; answer_text: string }>(`SELECT status, answer_text FROM questions WHERE id=?`, q.id)!;
      check("a reply to a question answers that question", answered.status === "answered");
      if (other) {
        check("…and not another open one in the same conversation",
          row<{ status: string }>(`SELECT status FROM questions WHERE id=?`, other.id)?.status === "open");
      }
      check("answering the blocking question lifts the block on its recommendation",
        row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, rec.id)?.status === "in_progress");
      const after = msg.thread("hospital", HOSPITAL_ID, rec.supplier_id)!;
      check("on the hospital's side the answer is a reply to the question",
        after.messages.some((m) => m.kind === "reply" && m.question?.id === q.id && !m.fromMe));
      check("the hospital has it unread", (msg.conversations("hospital", HOSPITAL_ID)
        .find((c) => c.supplierId === rec.supplier_id)?.unread ?? 0) >= 1);

      let foreign = false;
      const otherConv = row<{ question_id: string }>(
        `SELECT question_id FROM chat_messages WHERE question_id IS NOT NULL AND supplier_id != ? LIMIT 1`, rec.supplier_id);
      if (otherConv) {
        try {
          msg.postMessage({ side: "supplier", hospitalId: HOSPITAL_ID, supplierId: rec.supplier_id,
            body: "x", questionId: otherConv.question_id });
        } catch { foreign = true; }
        check("a reply cannot point at a question from another conversation", foreign);
      }
    }

    const silent = row<{ id: string }>(
      `SELECT o.id FROM organizations o WHERE o.type='supplier' AND o.channel='manufacturer'
         AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.supplier_id = o.id) LIMIT 1`);
    if (silent) {
      let refused = false;
      try { msg.postMessage({ side: "supplier", hospitalId: HOSPITAL_ID, supplierId: silent.id, body: "Hello" }); }
      catch { refused = true; }
      check("a manufacturer cannot start a conversation with a hospital", refused);
      msg.postMessage({ side: "hospital", hospitalId: HOSPITAL_ID, supplierId: silent.id, body: "Do you stock 22 mm circuits?" });
      check("a hospital can start one with any manufacturer",
        msg.conversations("supplier", silent.id).some((c) => c.hospitalId === HOSPITAL_ID)
          && msg.conversations("hospital", HOSPITAL_ID).find((c) => c.supplierId === silent.id)?.unread === 0);
    }
    let blank = false;
    try { msg.postMessage({ side: "hospital", hospitalId: HOSPITAL_ID, supplierId: rec?.supplier_id ?? "", body: "   " }); }
    catch { blank = true; }
    check("an empty message is refused", blank);
  }

  // ------------------------------------------------- §5 blocking-question gate
  section("§5 — blocking question blocks submission");
  const blocked = row<{ id: string }>(
    `SELECT r.id FROM recommendations r
     WHERE r.status IN ('new','in_progress','blocked')
       AND EXISTS (SELECT 1 FROM questions q WHERE q.recommendation_id=r.id
                   AND q.type='blocking' AND q.status='open') LIMIT 1`);
  check("a recommendation with an open blocking question exists", Boolean(blocked));
  if (blocked) {
    await w.submitOrder(blocked.id);
    const order = row<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders WHERE recommendation_id=?`, blocked.id)!;
    check("submitting while blocked creates no order", order.n === 0);

    await w.startReplace(blocked.id);
    const st = row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, blocked.id);
    check("an open blocking question puts the recommendation in 'blocked'", st?.status === "blocked");

    // Answer it, then the gate opens.
    const q = row<{ id: string }>(
      `SELECT id FROM questions WHERE recommendation_id=? AND type='blocking' AND status='open' LIMIT 1`,
      blocked.id)!;
    const fd = new FormData();
    fd.set("qId", q.id); fd.set("text", "Confirmed equivalent — same sterile barrier and connector.");
    await w.answerQuestion(fd);
    const st2 = row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, blocked.id);
    check("answering the blocking question unblocks it", st2?.status === "in_progress");

    await w.submitOrder(blocked.id);
    const ord = row<{ id: string; status: string }>(
      `SELECT id, status FROM orders WHERE recommendation_id=?`, blocked.id);
    check("submission now creates an order", Boolean(ord));

    // Clinical gate routing
    const rec = row<{ requires_clinical_review: number }>(
      `SELECT requires_clinical_review FROM recommendations WHERE id=?`, blocked.id)!;
    const expected = rec.requires_clinical_review ? "pending_clinical" : "pending_approval";
    check(`order enters '${expected}'`, ord?.status === expected, `got ${ord?.status}`);

    // ------------------------------------------------ §5 approval chain + pool
    section("§5 — approval chain and pooling");
    // Pools hold only what an approved order put there: no generated volume
    // from hospitals that never uploaded anything.
    const unbacked = row<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pooled_demand pd WHERE NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.demand_pool_id = pd.demand_pool_id
           AND o.hospital_id = pd.hospital_id
           AND o.status IN ('pooled','sanovio_fulfillment','fulfilled'))`)?.n ?? 0;
    check("no pool holds volume that no approved order put there", unbacked === 0, `${unbacked} line(s)`);
    if (ord && ord.status === "pending_clinical") {
      await w.clinicalSignOff(ord.id);
      const s = row<{ status: string; clinical_approver_id: string }>(
        `SELECT status, clinical_approver_id FROM orders WHERE id=?`, ord.id);
      check("clinical sign-off moves to pending_approval", s?.status === "pending_approval");
      check("clinical approver is recorded", Boolean(s?.clinical_approver_id));
    }
    if (ord) {
      const poolBefore = row<{ v: number }>(
        `SELECT COALESCE(SUM(annual_volume),0) AS v FROM pooled_demand pd
         JOIN orders o ON o.demand_pool_id = pd.demand_pool_id
         WHERE o.id=? AND pd.commitment='committed'`, ord.id)?.v ?? 0;
      await w.approveOrder(ord.id);
      const s = row<{ status: string; approver_id: string }>(
        `SELECT status, approver_id FROM orders WHERE id=?`, ord.id);
      check("approval moves the order into the pool", s?.status === "pooled");
      check("approver is recorded", s?.approver_id === "usr_appr");
      const poolAfter = row<{ v: number }>(
        `SELECT COALESCE(SUM(annual_volume),0) AS v FROM pooled_demand pd
         JOIN orders o ON o.demand_pool_id = pd.demand_pool_id
         WHERE o.id=? AND pd.commitment='committed'`, ord.id)?.v ?? 0;
      check("approved volume is committed to the pool", poolAfter > poolBefore, `${poolBefore} -> ${poolAfter}`);

      await w.lockPoolAndFulfil(ord.id);
      const s2 = row<{ status: string; sanovio_fulfillment_ref: string }>(
        `SELECT status, sanovio_fulfillment_ref FROM orders WHERE id=?`, ord.id);
      check("locking the pool routes to SANOVIO fulfilment", s2?.status === "sanovio_fulfillment");
      check("a SANOVIO fulfilment reference is issued — not a supplier reference",
        Boolean(s2?.sanovio_fulfillment_ref?.startsWith("SNV-")));

      await w.markFulfilled(ord.id);
      check("order reaches fulfilled",
        row<{ status: string }>(`SELECT status FROM orders WHERE id=?`, ord.id)?.status === "fulfilled");
    }
  }

  // ------------------------------------------ §5 clinical gate, end to end
  section("§5 — clinical gate on a Class III substitution");
  const cls3 = row<{ id: string }>(
    `SELECT r.id FROM recommendations r
     JOIN canonical_products cp ON cp.id = r.recommended_canonical_product_id
     WHERE r.type='substitution' AND cp.mdr_risk_class='III'
       AND r.status IN ('new','in_progress','blocked') LIMIT 1`);
  check("a Class III substitution is available to drive", Boolean(cls3));
  if (cls3) {
    // It must be blocked by its mandatory question first.
    await w.submitOrder(cls3.id);
    check("Class III cannot be submitted while its blocking question is open",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE recommendation_id=?`, cls3.id)[0].n === 0);

    const q3 = row<{ id: string; routed_to: string }>(
      `SELECT id, routed_to FROM questions WHERE recommendation_id=? AND type='blocking' AND status='open' LIMIT 1`,
      cls3.id)!;
    check("the Class III question is routed to SANOVIO, not the supplier", q3.routed_to === "sanovio_internal");

    const fd3 = new FormData();
    fd3.set("qId", q3.id);
    fd3.set("text", "Reviewed against the surgeon's implant preference list — acceptable.");
    await w.answerQuestion(fd3);
    await w.submitOrder(cls3.id);

    const o3 = row<{ id: string; status: string }>(
      `SELECT id, status FROM orders WHERE recommendation_id=?`, cls3.id);
    check("Class III order routes to pending_clinical, not straight to budget approval",
      o3?.status === "pending_clinical", `got ${o3?.status}`);

    if (o3) {
      // A budget approver must not be able to skip the clinical gate.
      await w.approveOrder(o3.id);
      check("budget approval cannot bypass the clinical gate",
        row<{ status: string }>(`SELECT status FROM orders WHERE id=?`, o3.id)?.status === "pending_clinical");

      await w.clinicalSignOff(o3.id);
      const after = row<{ status: string; clinical_approver_id: string }>(
        `SELECT status, clinical_approver_id FROM orders WHERE id=?`, o3.id);
      check("clinical sign-off advances to pending_approval", after?.status === "pending_approval");
      check("the clinician is recorded separately from the approver",
        after?.clinical_approver_id === "usr_clin");

      await w.approveOrder(o3.id);
      check("budget approval then succeeds",
        row<{ status: string }>(`SELECT status FROM orders WHERE id=?`, o3.id)?.status === "pooled");
    }
  }

  // ------------------------------------------------------- §5 dismiss / revive
  section("§5 — dismiss is never destructive");
  const toDismiss = row<{ id: string }>(
    `SELECT id FROM recommendations WHERE status='new' LIMIT 1`);
  if (toDismiss) {
    await w.dismiss(toDismiss.id, "Price too close");
    const d = row<{ status: string; dismissed_reason: string }>(
      `SELECT status, dismissed_reason FROM recommendations WHERE id=?`, toDismiss.id);
    check("dismiss moves to 'dismissed' and keeps the reason",
      d?.status === "dismissed" && d.dismissed_reason === "Price too close");
    await w.reconsider(toDismiss.id);
    check("a dismissed recommendation can be reconsidered",
      row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, toDismiss.id)?.status === "new");
  }

  const skippable = row<{ id: string }>(
    `SELECT id FROM questions WHERE type='non_blocking' AND status='open' LIMIT 1`);
  const notSkippable = row<{ id: string }>(
    `SELECT id FROM questions WHERE type='blocking' AND status='open' LIMIT 1`);
  if (skippable) {
    await w.skipQuestion(skippable.id);
    check("a non-blocking question can be skipped",
      row<{ status: string }>(`SELECT status FROM questions WHERE id=?`, skippable.id)?.status === "skipped");
  }
  if (notSkippable) {
    await w.skipQuestion(notSkippable.id);
    check("a blocking question cannot be skipped",
      row<{ status: string }>(`SELECT status FROM questions WHERE id=?`, notSkippable.id)?.status === "open");
  }

  // ----------------------------------------------------------- idempotency
  section("pipeline re-run does not duplicate or resurrect");
  const decidedBefore = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recommendations WHERE status IN ('dismissed','ordered')`)[0].n;
  await w.rerunPipeline();
  const decidedAfter = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recommendations WHERE status IN ('dismissed','ordered')`)[0].n;
  check("re-running the pipeline preserves user decisions",
    decidedAfter === decidedBefore, `${decidedBefore} -> ${decidedAfter}`);

  const dupes = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT hospital_item_id, recommended_canonical_product_id, supplier_id, COUNT(*) c
       FROM recommendations GROUP BY 1,2,3 HAVING c > 1)`)[0];
  check("no duplicate recommendations after a re-run", dupes.n === 0);

  // ------------------------------------------------ extract_lib agreement
  section("the catalogue importer still matches extract_lib");
  const schema = checkExtractSchema();
  if (schema.skipped) {
    console.log("  skip extract_lib not present");
  } else {
    check("the importer's shapes match extract/schema.py", schema.ok,
      schema.problems.join("; "));
  }

  // --------------------------------------- corrections attribute correctly
  section("a correction is attributed to a real user, resolved from the data");
  const supRow = rows<{ id: string; supplier_id: string }>(
    `SELECT id, supplier_id FROM supplier_catalog_items LIMIT 1`)[0];
  if (supRow) {
    const fd = new FormData();
    fd.set("itemId", supRow.id); fd.set("kind", "supplier");
    fd.set("field", "extracted_name"); fd.set("value", "verify-correction");
    let threw: string | null = null;
    try { await w.correctField(fd); } catch (e) { threw = (e as Error).message; }
    check("correcting a manufacturer's row does not violate a foreign key",
      threw === null, threw ?? "");

    const corrected = rows<{ corrected_by: string | null }>(
      `SELECT corrected_by FROM supplier_catalog_items WHERE id=?`, supRow.id)[0];
    const ownerUser = rows<{ id: string }>(
      `SELECT id FROM users WHERE organization_id=? AND role='supplier_user' LIMIT 1`,
      supRow.supplier_id)[0];
    check("it is attributed to that manufacturer's own user, not a hardcoded id",
      corrected.corrected_by === (ownerUser?.id ?? null),
      `${corrected.corrected_by} vs ${ownerUser?.id}`);
  }

  // Every foreign key that names a user must point at one that exists. A
  // constant baked into the code is exactly what breaks when this module is
  // deployed against somebody else's user table.
  const danglingUsers = rows<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM supplier_catalog_items s
              WHERE s.corrected_by IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.corrected_by))
          + (SELECT COUNT(*) FROM hospital_purchase_items h
              WHERE h.corrected_by IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = h.corrected_by))
          + (SELECT COUNT(*) FROM correction_log c
              WHERE c.corrected_by IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.corrected_by))
          + (SELECT COUNT(*) FROM questions q
              WHERE q.answered_by IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = q.answered_by))
          AS n`)[0].n;
  check("no audit column points at a user that does not exist", danglingUsers === 0);

  // ------------------------------------------- prices are never invented
  section("the platform never invents a price");
  const fabricated = rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM price_tiers WHERE origin NOT IN ('catalogue','supplier')`)[0].n;
  check("every price tier traces to a catalogue or a human", fabricated === 0);

  const unpricedProducts = rows<{ id: string; canonical_name: string }>(
    `SELECT cp.id, cp.canonical_name FROM canonical_products cp
     WHERE NOT EXISTS (SELECT 1 FROM price_tiers t WHERE t.canonical_product_id = cp.id)`);
  const claimsOnUnpriced = unpricedProducts.length === 0 ? 0 : rows<{ n: number }>(
    `SELECT COUNT(*) AS n FROM recommendations r
     WHERE NOT EXISTS (SELECT 1 FROM price_tiers t
                       WHERE t.canonical_product_id = r.recommended_canonical_product_id)`)[0].n;
  check("a product with no price produces no savings claim", claimsOnUnpriced === 0,
    `${unpricedProducts.length} unpriced product(s), ${claimsOnUnpriced} claim(s)`);

  // ------------------------------------------------ product review + chat
  section("product review raises questions and routes them");
  // The pair that matters is a genuine cross-brand substitution: same category,
  // different manufacturer. Comparing a line against its own product would only
  // ever return 'identical' and raise nothing.
  const pair = rows<{
    item_id: string; item_name: string; cand_id: string; cand_name: string; mfr: string;
  }>(`SELECT h.id AS item_id, h.extracted_name AS item_name,
             other.id AS cand_id, other.canonical_name AS cand_name, other.manufacturer_id AS mfr
      FROM hospital_purchase_items h
      JOIN canonical_products mine ON mine.id = h.canonical_product_id
      JOIN canonical_products other
        ON other.eclass_code = mine.eclass_code
       AND other.id != mine.id
       AND other.manufacturer_id IS NOT NULL
       AND other.manufacturer_id IS NOT mine.manufacturer_id
      WHERE h.canonical_product_id IS NOT NULL
      ORDER BY CASE other.mdr_risk_class WHEN 'III' THEN 0 WHEN 'IIb' THEN 1 ELSE 2 END
      LIMIT 1`)[0];
  const line = pair && { id: pair.item_id, extracted_name: pair.item_name };
  const candidate = pair && { id: pair.cand_id, canonical_name: pair.cand_name, manufacturer_id: pair.mfr };
  check("a cross-brand substitution pair exists to review", Boolean(pair),
    pair ? `${pair.item_name} -> ${pair.cand_name}` : "none found");

  if (line && candidate) {
    const first = await w.reviewProduct(line.id, candidate.id);
    check("comparing a line against a product returns a verdict and a summary",
      Boolean(first.relation && first.summary), first.summary);
    // The label must name what actually answered. A key that is present but
    // rejected must never be credited for output the fallback produced.
    check("the comparison reports the adapter that actually ran",
      first.adapter === "claude-opus-5" || first.adapter === "deterministic comparison",
      first.adapter);

    const runsAfterFirst = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM product_comparisons WHERE hospital_item_id=? AND canonical_product_id=?`,
      line.id, candidate.id)[0].n;
    await w.reviewProduct(line.id, candidate.id);
    const runsAfterSecond = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM product_comparisons WHERE hospital_item_id=? AND canonical_product_id=?`,
      line.id, candidate.id)[0].n;
    check("opening the same product twice does not run a second comparison",
      runsAfterFirst === 1 && runsAfterSecond === 1);

    const problems = w.openProblems(line.id, candidate.id);
    if (problems.length > 0) {
      const toSend = problems.find((p) => p.routedTo === "supplier");
      if (toSend) {
        w.sendProblemToSupplier(toSend.id);
        const msg = rows<{ n: number }>(
          `SELECT COUNT(*) AS n FROM chat_messages WHERE question_id=?`, toSend.id)[0].n;
        check("sending a question to the supplier opens it in the hospital's thread", msg === 1);

        const thread = rows<{ hospital_id: string; supplier_id: string }>(
          `SELECT hospital_id, supplier_id FROM chat_messages WHERE question_id=?`, toSend.id)[0];
        check("the thread is scoped to this hospital and that manufacturer",
          thread.hospital_id === HOSPITAL_ID && thread.supplier_id === candidate.manufacturer_id);

        const fd = new FormData();
        fd.set("supplierId", candidate.manufacturer_id);
        fd.set("as", "supplier");
        fd.set("questionId", toSend.id);
        fd.set("body", "Confirmed — the replacement is sterile, single-use, same connector.");
        w.postChatMessage(fd);
        const answered = rows<{ status: string; answer_text: string }>(
          `SELECT status, answer_text FROM questions WHERE id=?`, toSend.id)[0];
        check("the manufacturer's reply answers the question", answered.status === "answered");
      }

      const toClear = w.openProblems(line.id, candidate.id).find((p) => p.status === "open");
      if (toClear) {
        w.clearProblem(toClear.id);
        const after = rows<{ status: string; cleared_by: string | null }>(
          `SELECT status, cleared_by FROM questions WHERE id=?`, toClear.id)[0];
        check("clearing a question keeps the row and records who cleared it",
          after.status === "cleared" && after.cleared_by !== null);
        check("a cleared question leaves the worklist",
          !w.openProblems(line.id, candidate.id).some((p) => p.id === toClear.id));
      }
    }

    // A re-run must not silently undo decisions the buyer already made, nor
    // re-ask a question that has already been answered.
    const before = rows<{ cleared: number; answered: number; total: number }>(
      `SELECT SUM(status='cleared') AS cleared, SUM(status='answered') AS answered,
              COUNT(*) AS total FROM questions
       WHERE hospital_item_id=? AND canonical_product_id=?`, line.id, candidate.id)[0];
    await w.reviewProduct(line.id, candidate.id, true);
    const after = rows<{ cleared: number; answered: number; total: number }>(
      `SELECT SUM(status='cleared') AS cleared, SUM(status='answered') AS answered,
              COUNT(*) AS total FROM questions
       WHERE hospital_item_id=? AND canonical_product_id=?`, line.id, candidate.id)[0];
    check("re-running the comparison preserves cleared and answered questions",
      after.cleared === before.cleared && after.answered === before.answered,
      `cleared ${before.cleared}->${after.cleared}, answered ${before.answered}->${after.answered}`);
    check("re-running does not re-ask a question that was already resolved",
      after.total === before.total, `${before.total} -> ${after.total} questions`);
  }

  section("choosing a replacement, and the analysis behind it");
  if (line && candidate) {
    const questionsBefore = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM questions WHERE hospital_item_id=? AND canonical_product_id=?`,
      line.id, candidate.id)[0].n;
    const chosen = rep.selectReplacement(line.id, candidate.id);
    // Queued — or, if the suggestion pipeline already analysed this exact
    // pair, adopted on the spot.
    const chosenStatus = row<{ analysis_status: string }>(
      `SELECT analysis_status FROM replacements WHERE id=?`, chosen.id)?.analysis_status;
    check("choosing a replacement records it and queues the analysis",
      (chosen.analysing && chosenStatus === "pending") || (chosen.precomputed === true && chosenStatus === "done"),
      `${chosenStatus}`);
    check("questions already raised about the pair belong to the replacement now",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM questions WHERE replacement_id=?`, chosen.id)[0].n
        === questionsBefore);
    check("choosing the same product again is not a second replacement",
      rep.selectReplacement(line.id, candidate.id).id === chosen.id
        && rows<{ n: number }>(`SELECT COUNT(*) AS n FROM replacements WHERE hospital_item_id=?`, line.id)[0].n === 1);

    const shelf = hospitalCatalogue();
    const entry = shelf.find((e) => e.lineId === line.id);
    check("the catalogue lists the replacement under the line it replaces",
      entry?.replacement?.canonicalId === candidate.id && entry.replacement.status === "pending");
    check("a chosen replacement is not listed a second time as a loose proposal",
      !shelf.some((e) => !e.lineId && e.canonicalId === candidate.id));

    await rep.runReplacementAnalysis(chosen.id);
    const view = replacementFor(line.id, candidate.id)!;
    check("the analysis finishes and says what answered it",
      view.status === "done" && Boolean(view.adapter) && Boolean(view.summary), view.error ?? view.adapter ?? "");
    check("a run with no web search is labelled as one",
      view.webSearches > 0 || /no web search/.test(view.adapter ?? ""), view.adapter ?? "");
    const aiPoints = view.points.filter((p) => p.category);
    check("the analysis compacts its findings into titled, explained points",
      aiPoints.length > 0 && aiPoints.every((p) => p.title && p.detail && p.text),
      `${aiPoints.length} points`);
    check("every point is filed under price, replaceability, safety or correctness",
      aiPoints.every((p) => ["price", "replaceability", "safety", "correctness"].includes(p.category!)));
    check("the superseded browse-time comparison does not linger beside the analysis",
      !view.points.some((p) => !p.category && p.status === "open" && !p.sentAt));

    const cls = row<{ mdr_risk_class: string }>(
      `SELECT mdr_risk_class FROM canonical_products WHERE id=?`, candidate.id)!.mdr_risk_class;
    if (cls === "IIb" || cls === "III") {
      check(`a class ${cls} change of manufacturer raises a blocking safety point`,
        aiPoints.some((p) => p.category === "safety" && p.severity === "blocking"));
    }

    // The price the analysis was handed is one the manufacturer stated.
    const facts = JSON.parse(row<{ price_facts: string }>(
      `SELECT price_facts FROM replacements WHERE id=?`, chosen.id)!.price_facts);
    const stated = rows<{ unit_price: number }>(
      `SELECT unit_price FROM price_tiers WHERE canonical_product_id=?`, candidate.id).map((t) => t.unit_price);
    check("the analysis is priced from a stated tier or not at all",
      facts.offeredUnitPrice === null ? stated.length === 0 : stated.includes(facts.offeredUnitPrice),
      String(facts.offeredUnitPrice));

    const toSendRep = replacementFor(line.id, candidate.id)!.points
      .find((p) => p.category && p.status === "open" && !p.sentAt);
    check("there is a point left to send", Boolean(toSendRep));
    if (toSendRep) {
      w.sendProblemToSupplier(toSendRep.id);
      const body = row<{ body: string }>(`SELECT body FROM chat_messages WHERE question_id=?`, toSendRep.id)?.body ?? "";
      check("a point sent to the manufacturer names the product it is about",
        body.includes(candidate.canonical_name.slice(0, 24)), body.slice(0, 80));
    }

    const toSign = view.points.find((p) => p.category && p.category !== "safety" && p.status === "open")
      ?? view.points.find((p) => p.category && p.status === "open");
    if (toSign) {
      rep.signOffPoint(toSign.id);
      const signed = row<{ status: string; cleared_by: string | null }>(
        `SELECT status, cleared_by FROM questions WHERE id=?`, toSign.id)!;
      check("signing a point off keeps it, with who signed it", signed.status === "cleared" && !!signed.cleared_by);
    }
    const safety = replacementFor(line.id, candidate.id)!.points
      .find((p) => p.category === "safety" && p.status === "open");
    if (safety) {
      rep.signOffPoint(safety.id);
      check("a safety point is signed off by the clinical approver, not the buyer",
        row<{ cleared_by: string }>(`SELECT cleared_by FROM questions WHERE id=?`, safety.id)!.cleared_by === CLINICAL);
    }
    const decided = rows<{ id: string }>(
      `SELECT id FROM questions WHERE replacement_id=? AND (status!='open' OR sent_at IS NOT NULL)`, chosen.id)
      .map((r) => r.id);
    check("a finished analysis can be run again", rep.requestReanalysis(chosen.id));
    await rep.runReplacementAnalysis(chosen.id);
    const rerun = replacementFor(line.id, candidate.id)!;
    check("re-running keeps every point the hospital already acted on",
      decided.every((qid) => rerun.points.some((p) => p.id === qid)), `${decided.length} decided`);
    const rerunKeys = rerun.points.filter((p) => p.category).map((p) => `${p.category}|${p.title}`);
    check("re-running does not raise a decided point a second time",
      new Set(rerunKeys).size === rerunKeys.length, rerunKeys.join("; "));

    // Replace → order: the §5 gates, read off the replacement.
    const blockingLeft = rows<{ id: string }>(
      `SELECT id FROM questions WHERE replacement_id=? AND type='blocking' AND status IN ('open','answered')`,
      chosen.id);
    if (blockingLeft.length) {
      let refused = false;
      try { rep.orderReplacement(chosen.id); } catch { refused = true; }
      check("a replacement with a blocking point left cannot be ordered", refused
        && !rep.replacementOrderability(chosen.id).canOrder);
    }
    for (const q of blockingLeft) rep.signOffPoint(q.id);
    const orderable = rep.replacementOrderability(chosen.id);
    check("once every blocking point is signed off, the replacement can be ordered",
      orderable.canOrder, orderable.reasons.join(" "));
    if (orderable.canOrder) {
      const placed = rep.orderReplacement(chosen.id);
      const ord = row<{ status: string; volume: number; recommendation_id: string }>(
        `SELECT status, volume, recommendation_id FROM orders WHERE id=?`, placed.orderId)!;
      const recRow = row<{ status: string; origin: string; type: string; requires_clinical_review: number;
                           offered_unit_price: number }>(
        `SELECT status, origin, type, requires_clinical_review, offered_unit_price FROM recommendations WHERE id=?`,
        ord.recommendation_id)!;
      check("ordering creates an order in the ordinary approval chain",
        ord.status === (orderable.requiresClinical ? "pending_clinical" : "pending_approval"), ord.status);
      check("the order is priced from a stated tier",
        rows<{ unit_price: number }>(`SELECT unit_price FROM price_tiers WHERE canonical_product_id=?`, candidate.id)
          .some((t) => t.unit_price === recRow.offered_unit_price));
      check("a cross-brand replacement is ordered as a substitution, with its clinical flag",
        recRow.type === "substitution" && recRow.status === "ordered"
          && recRow.requires_clinical_review === (orderable.requiresClinical ? 1 : 0));
      check("the catalogue shows the replacement as ordered",
        hospitalCatalogue().find((e) => e.lineId === line.id)?.replacement?.orderStatus === ord.status);
      let blockedWithdraw = false;
      try { rep.withdrawReplacement(chosen.id); } catch { blockedWithdraw = true; }
      check("an ordered replacement cannot be withdrawn out from under its order", blockedWithdraw);
      check("an ordered replacement's analysis is not re-run", !rep.requestReanalysis(chosen.id));
      let secondRefused = false;
      try { rep.orderReplacement(chosen.id); } catch { secondRefused = true; }
      check("a replacement is ordered once", secondRefused);

      await w.rerunPipeline();
      check("rebuilding recommendations keeps a replacement's order",
        Boolean(row(`SELECT 1 FROM recommendations WHERE id=?`, ord.recommendation_id))
          && Boolean(row(`SELECT 1 FROM orders WHERE id=?`, placed.orderId)));

      const fd = new FormData();
      fd.set("orderId", placed.orderId); fd.set("reason", "Not this quarter");
      await w.rejectOrder(fd);
      check("a rejected order hands the replacement back to the buyer, still chosen",
        rep.replacementOrderability(chosen.id).order === null
          && row<{ status: string }>(`SELECT status FROM recommendations WHERE id=?`, ord.recommendation_id)?.status === "in_progress");
      await w.rerunPipeline();
      check("a rejected replacement order survives the next rebuild",
        Boolean(row(`SELECT 1 FROM recommendations WHERE id=?`, ord.recommendation_id)));
    }

    // Switching to another product keeps decisions, drops the rest.
    const other = row<{ id: string }>(
      `SELECT id FROM canonical_products WHERE id NOT IN (?, COALESCE(?, '')) LIMIT 1`,
      candidate.id, row<{ canonical_product_id: string | null }>(
        `SELECT canonical_product_id FROM hospital_purchase_items WHERE id=?`, line.id)?.canonical_product_id ?? null);
    if (other) {
      const switched = rep.selectReplacement(line.id, other.id);
      check("choosing a different product switches the line's replacement",
        switched.id !== chosen.id && !row(`SELECT 1 FROM replacements WHERE id=?`, chosen.id)
          && rows<{ n: number }>(`SELECT COUNT(*) AS n FROM replacements WHERE hospital_item_id=?`, line.id)[0].n === 1);
      check("points the hospital acted on survive the switch, detached",
        decided.every((qid) => row<{ replacement_id: string | null }>(
          `SELECT replacement_id FROM questions WHERE id=?`, qid)?.replacement_id === null));
      rep.withdrawReplacement(switched.id);
      check("withdrawing leaves the line with no replacement",
        !row(`SELECT 1 FROM replacements WHERE hospital_item_id=?`, line.id));

      // Removing the product takes its replacement with it, and the foreign
      // keys have to allow that in one go.
      const again = rep.selectReplacement(line.id, other.id);
      await rep.runReplacementAnalysis(again.id);
      let purged = true;
      try { await w.deleteCanonicalProduct(other.id); } catch { purged = false; }
      check("deleting the product removes the replacement chosen for it",
        purged && !row(`SELECT 1 FROM replacements WHERE id=?`, again.id));
    }

    const last = rep.selectReplacement(line.id, candidate.id);
    let removed = true;
    try { await w.deleteHospitalLine(line.id); } catch { removed = false; }
    check("deleting the line removes its replacement",
      removed && !row(`SELECT 1 FROM replacements WHERE id=?`, last.id));
  }

  section("automatic suggestions — the staged pipeline");
  {
    // Stage 1 on its own: it may only block on facts both sides state.
    const needle = { codes: {}, category: "34110301", uom: "Stück", attrs: { od_mm: 0.8, length_mm: 40 } };
    check("stage 1 blocks different categories",
      /category/.test(block(needle, { ...needle, category: "34110201" }) ?? ""));
    check("stage 1 blocks a dimension both sides state and disagree on",
      /length/.test(block(needle, { ...needle, attrs: { od_mm: 0.8, length_mm: 25 } }) ?? ""));
    check("stage 1 lets through a dimension only one side states",
      block(needle, { ...needle, attrs: { od_mm: 0.8 } }) === null);
    check("stage 1 lets an unclassified product through to the cheaper model stages",
      block(needle, { ...needle, category: "34199999" }) === null);
    check("stage 1 blocks disagreeing standard codes",
      /UNSPSC/.test(block({ ...needle, codes: { unspsc: "42142523" } },
        { ...needle, codes: { unspsc: "42142609" } }) ?? ""));
    check("stage 1 blocks across unit families, not within one",
      /unit/.test(block(needle, { ...needle, uom: "ml" }) ?? "")
        && block(needle, { ...needle, uom: "Tuch" }) === null);

    const first = await runSuggestions("verify");
    check("a run covers every line against every product",
      first.pairsTotal === first.lines * first.products && first.pairsTotal > 0,
      `${first.lines} × ${first.products}`);
    check("each stage passes on no more than it received",
      first.afterStage1 <= first.pairsTotal && first.afterStage2 <= first.afterStage1
        && first.afterStage3 <= first.afterStage2 && first.matched <= first.afterStage3,
      `${first.pairsTotal} → ${first.afterStage1} → ${first.afterStage2} → ${first.afterStage3} → ${first.matched}`);
    check("the free stage removes most pairs before any model sees them",
      first.afterStage1 < first.pairsTotal / 2, `${first.afterStage1} of ${first.pairsTotal}`);

    const unexplained = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM match_pairs WHERE outcome != 'matched'
         AND (drop_stage IS NULL OR reason IS NULL OR reason = '')`)[0].n;
    check("every dropped pair records its stage and reason", unexplained === 0, `${unexplained} without`);
    check("no pair dropped before stage 3 was sent to Jev or Claude",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM match_pairs WHERE drop_stage IN (1,2)
        AND jev_hash IS NOT NULL AND run_id = ?`, first.runId)[0].n === 0);
    check("no pair Jev dropped reached Claude",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM match_pairs WHERE drop_stage = 3
        AND adjudication_hash IS NOT NULL AND run_id = ?`, first.runId)[0].n === 0);

    // A shared GTIN is settled by the rules, for free.
    const gtinPair = row<{ outcome: string; relation: string; jev_score: number | null }>(
      `SELECT m.outcome, m.relation, m.jev_score FROM match_pairs m
       JOIN hospital_purchase_items h ON h.id = m.hospital_item_id
       JOIN canonical_products cp ON cp.id = m.canonical_product_id
       WHERE h.extracted_gtin IS NOT NULL AND ltrim(h.extracted_gtin,'0') = ltrim(cp.gtin,'0') LIMIT 1`);
    if (gtinPair) {
      check("a shared GTIN is an identical match without a model call",
        gtinPair.outcome === "matched" && gtinPair.relation === "identical" && gtinPair.jev_score === null);
    }

    const tops = rows<{ hospital_item_id: string; n: number }>(
      `SELECT hospital_item_id, COUNT(*) AS n FROM match_pairs WHERE is_top = 1 GROUP BY hospital_item_id`);
    check("at most one best match per line", tops.every((t) => t.n === 1));
    check("every best match is a match",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM match_pairs WHERE is_top = 1 AND outcome != 'matched'`)[0].n === 0);
    const analysed = rows<{ analysis_json: string }>(
      `SELECT analysis_json FROM match_pairs WHERE is_top = 1 AND analysis_status = 'done'`);
    check("the best match per line is analysed in full, as Replace with this would be",
      analysed.length > 0 && analysed.every((a) => Array.isArray(JSON.parse(a.analysis_json).points)),
      `${analysed.length} analysed`);
    check("only best matches are analysed",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM match_pairs WHERE is_top = 0
        AND analysis_status = 'done' AND dismissed_at IS NULL`)[0].n === 0);

    const second = await runSuggestions("verify again");
    const gated = rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM match_pairs WHERE jev_hash IS NOT NULL AND run_id = ?`, first.runId)[0].n;
    check("a second run reuses every result instead of computing it again",
      second.reused >= gated && second.jevCalls + second.claudeCalls + second.analysisCalls === 0
        && second.matched === first.matched,
      `reused ${second.reused} of ${gated} gated, matched ${first.matched} -> ${second.matched}`);

    const cards = suggestionCards();
    check("the cockpit shows the best matches as suggestions", cards.length > 0, `${cards.length} cards`);
    check("a suggestion never duplicates a priced recommendation for the same pair",
      cards.every((c) => !row(`SELECT 1 FROM recommendations WHERE hospital_item_id=?
        AND recommended_canonical_product_id=? AND status IN ('new','in_progress','blocked')`,
        c.itemId, c.canonicalId)));

    // Choosing a suggested product takes over the analysis already paid for.
    const ready = cards.find((c) => c.analysisStatus === "done");
    if (ready) {
      const expected = JSON.parse(row<{ analysis_json: string }>(
        `SELECT analysis_json FROM match_pairs WHERE hospital_item_id=? AND canonical_product_id=?`,
        ready.itemId, ready.canonicalId)!.analysis_json).points.length;
      const chosen = rep.selectReplacement(ready.itemId, ready.canonicalId);
      const view = replacementFor(ready.itemId, ready.canonicalId)!;
      check("choosing a pre-analysed suggestion adopts its analysis instead of running another",
        chosen.precomputed === true && !chosen.analysing && view.status === "done");
      check("the adopted analysis arrives with all its points",
        view.points.filter((p) => p.category).length === expected, `${expected} expected`);
      check("a chosen suggestion leaves the suggestion feed",
        !suggestionCards().some((c) => c.itemId === ready.itemId && c.canonicalId === ready.canonicalId));
    }

    const other = row<{ itemId: string; canonicalId: string }>(
      `SELECT hospital_item_id AS itemId, canonical_product_id AS canonicalId FROM match_pairs
       WHERE is_top = 1 AND outcome = 'matched' AND dismissed_at IS NULL
         AND hospital_item_id NOT IN (SELECT hospital_item_id FROM replacements) LIMIT 1`);
    check("there is a suggestion left to dismiss", Boolean(other));
    if (other) {
      dismissSuggestion(other.itemId, other.canonicalId);
      await runSuggestions("verify dismiss");
      check("a dismissed suggestion stays off the feed after the next run",
        !suggestionCards().some((c) => c.itemId === other.itemId && c.canonicalId === other.canonicalId)
          && !row(`SELECT 1 FROM match_pairs WHERE hospital_item_id=? AND canonical_product_id=?
            AND is_top = 1`, other.itemId, other.canonicalId));
      check("a dismissed suggestion is kept, not deleted",
        Boolean(row(`SELECT 1 FROM match_pairs WHERE hospital_item_id=? AND canonical_product_id=?
          AND dismissed_at IS NOT NULL`, other.itemId, other.canonicalId)));
      await w.deleteHospitalLine(other.itemId);
      check("deleting a line removes its pairs",
        !row(`SELECT 1 FROM match_pairs WHERE hospital_item_id=?`, other.itemId));
    }
  }

  section("search — by meaning, across languages, forgiving of typos");
  {
    const names = async (q: string) => (await searchProducts(q)).hits.map((h) => h.name);
    const hipsDe = await names("Hüftpfanne");
    check("a German word finds its products", hipsDe.some((n) => /Hüftpfanne/.test(n)), hipsDe.join("; "));
    check("the same products come up in English", (await names("hip implant")).some((n) => /Hüftpfanne/.test(n)));
    check("…in French", (await names("hanche")).some((n) => /Hüftpfanne/.test(n)));
    check("…and for a phrase that is two translations", (await names("ventilator tubing"))
      .some((n) => /Beatmungsschlauch/.test(n)));
    check("a typo still finds the product", (await names("Beatmungschlauch")).some((n) => /Beatmungsschlauch/.test(n)));
    const withGtin = row<{ gtin: string; canonical_name: string }>(
      `SELECT gtin, canonical_name FROM canonical_products WHERE gtin IS NOT NULL LIMIT 1`);
    if (withGtin) {
      const gtin = await searchProducts(withGtin.gtin);
      check("a GTIN finds exactly its article, and nothing near it",
        gtin.hits.length === 1 && gtin.hits[0].match === "identifier"
          && gtin.hits[0].name === withGtin.canonical_name, gtin.hits.map((h) => h.name).join("; "));
    }
    check("a query with nothing close returns nothing, not filler",
      (await searchProducts("xyzzy quux")).hits.length === 0);
    const translated = (await searchProducts("hip implant")).hits[0];
    check("a hit found through translation is labelled a close match, not a word match",
      translated?.match === "meaning");
    check("a word typed as printed is a word match", (await searchProducts("Hüftpfannen")).hits[0]?.match === "text");

    check("every product vector is from the model that answers now",
      rows<{ n: number }>(`SELECT COUNT(*) AS n FROM canonical_products
        WHERE embedding IS NULL OR embedding_model IS NOT ?`, embeddingTag())[0].n === 0);
    check("vectors of different lengths are never compared",
      cosine(new Float32Array([1, 0, 0]), new Float32Array([1, 0])) === 0);
  }

  // --------------------------------------------------------------- summary
  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
  conn.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
