"use server";

/**
 * Thin server-action wrappers. All behaviour lives in lib/workflow.ts;
 * this file only adds the cache invalidation Next needs.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as w from "./workflow";
import * as rep from "./replacement";
import { runSuggestions, dismissSuggestion, reconsiderSuggestion } from "./matching/suggest";
import * as msg from "./messaging";
import { HOSPITAL_ID } from "./constants";
import { replacementStatus, suggestionsPending, type AnalysisStatus } from "./queries";
import { currentSupplier } from "./session";

const HOSPITAL_PATHS = ["/", "/hospital", "/hospital/catalogue", "/hospital/documents",
  "/hospital/approvals", "/hospital/messages"];
const SUPPLIER_PATHS = ["/supplier", "/supplier/upload", "/supplier/pricing",
  "/supplier/demand", "/supplier/questions", "/supplier/messages"];
const ADMIN_PATHS = ["/admin", "/admin/pipeline", "/admin/documents"];
const ALL_PATHS = [...HOSPITAL_PATHS, ...SUPPLIER_PATHS, ...ADMIN_PATHS];
const refresh = (paths: string[]) => paths.forEach((p) => revalidatePath(p));

export async function confirmLink(linkId: string) {
  await w.confirmLink(linkId); refresh(ALL_PATHS);
}
export async function rejectLink(linkId: string) {
  await w.rejectLink(linkId); refresh(HOSPITAL_PATHS);
}
export async function confirmExtraction(itemId: string, kind: "hospital" | "supplier") {
  await w.confirmExtraction(itemId, kind); refresh(ALL_PATHS);
}
export async function correctField(formData: FormData) {
  await w.correctField(formData); refresh(ALL_PATHS);
}
export async function dismiss(recId: string, reason: string | null) {
  await w.dismiss(recId, reason); refresh(HOSPITAL_PATHS);
}
export async function reconsider(recId: string) {
  await w.reconsider(recId); refresh(HOSPITAL_PATHS);
}
export async function startReplace(recId: string) {
  await w.startReplace(recId); refresh(HOSPITAL_PATHS);
}
export async function askQuestion(formData: FormData) {
  await w.askQuestion(formData); refresh(ALL_PATHS);
}
export async function answerQuestion(formData: FormData) {
  await w.answerQuestion(formData); refresh(ALL_PATHS);
}
export async function skipQuestion(qId: string) {
  await w.skipQuestion(qId); refresh(HOSPITAL_PATHS);
}
export async function submitOrder(recId: string) {
  await w.submitOrder(recId); refresh(HOSPITAL_PATHS);
}
export async function clinicalSignOff(orderId: string) {
  await w.clinicalSignOff(orderId); refresh(HOSPITAL_PATHS);
}
export async function approveOrder(orderId: string) {
  await w.approveOrder(orderId); refresh(ALL_PATHS);
}
export async function rejectOrder(formData: FormData) {
  await w.rejectOrder(formData); refresh(HOSPITAL_PATHS);
}
export async function lockPoolAndFulfil(orderId: string) {
  await w.lockPoolAndFulfil(orderId); refresh(ALL_PATHS);
}
export async function markFulfilled(orderId: string) {
  await w.markFulfilled(orderId); refresh(HOSPITAL_PATHS);
}
export async function rerunPipeline() {
  await w.rerunPipeline(); refresh(ALL_PATHS);
}

// --- uploads (useActionState signature: (prevState, formData)) -----------

export async function uploadHospitalDemandAction(
  _prev: w.UploadOutcome | null, formData: FormData,
): Promise<w.UploadOutcome> {
  const res = await w.uploadHospitalDemand(formData);
  if (res.ok) { refresh(ALL_PATHS); suggestAfterResponse("hospital upload"); }
  return res;
}

export async function uploadSupplierCatalogueAction(
  _prev: w.UploadOutcome | null, formData: FormData,
): Promise<w.UploadOutcome> {
  // Who the catalogue belongs to is the session's answer, not the form's: a
  // manufacturer can only ever upload as itself.
  const me = await currentSupplier();
  if (!me) return { ok: false, message: "No manufacturer is signed in." };
  formData.set("supplierId", me.id);

  const res = await w.uploadSupplierCatalogue(formData);
  if (res.ok) { refresh(ALL_PATHS); suggestAfterResponse(`catalogue upload (${me.name})`); }
  return res;
}

export async function deleteDocument(docId: string) {
  await w.deleteDocument(docId); refresh(ALL_PATHS);
}

export async function deleteProduct(canonicalId: string) {
  await w.deleteCanonicalProduct(canonicalId); refresh(ALL_PATHS);
}

export async function deleteHospitalLine(lineId: string) {
  await w.deleteHospitalLine(lineId); refresh(ALL_PATHS);
}

// --- A manufacturer editing its own product ------------------------------
//
// Ownership is resolved from the session, never from the form: the product id
// arrives from the client, so the only thing stopping one manufacturer editing
// another's article is that workflow.ts checks manufacturer_id against the
// company we resolved here.

export interface EditOutcome { ok: boolean; message: string }

export async function saveProductDescription(
  _prev: EditOutcome | null, formData: FormData,
): Promise<EditOutcome> {
  const me = await currentSupplier();
  if (!me) return { ok: false, message: "No manufacturer is signed in." };
  const canonicalId = String(formData.get("canonicalId") ?? "");
  await w.setProductDescription(me.id, canonicalId, String(formData.get("description") ?? ""));
  refresh(ALL_PATHS);
  return { ok: true, message: "Description saved." };
}

/**
 * The whole ladder in one submit.
 *
 * Tiers arrive as parallel `minVolume` / `unitPrice` fields — the form posts
 * one pair per row — so the set is replaced atomically rather than patched
 * row by row. A ladder half-saved is a price nobody quoted.
 */
export async function savePriceTiers(
  _prev: EditOutcome | null, formData: FormData,
): Promise<EditOutcome> {
  const me = await currentSupplier();
  if (!me) return { ok: false, message: "No manufacturer is signed in." };
  const canonicalId = String(formData.get("canonicalId") ?? "");

  const volumes = formData.getAll("minVolume").map(String);
  const prices = formData.getAll("unitPrice").map(String);
  const tiers = volumes
    .map((v, i) => ({ volume: v.trim(), price: (prices[i] ?? "").trim() }))
    // A row where both boxes are empty is one the manufacturer added and did
    // not fill in; a row with one box filled is a mistake worth reporting.
    .filter((r) => r.volume !== "" || r.price !== "")
    .map((r) => ({
      minVolume: Number(r.volume.replace(/[^\d-]/g, "") || "0"),
      unitPrice: Number(r.price.replace(",", ".")),
    }));

  if (tiers.some((t) => !Number.isFinite(t.unitPrice))) {
    return { ok: false, message: "Every tier needs a price." };
  }

  try {
    if (!tiers.length) await w.clearPriceTiers(me.id, canonicalId);
    else await w.setPriceTiers(me.id, canonicalId, tiers);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  refresh(ALL_PATHS);
  return {
    ok: true,
    message: tiers.length
      ? `Saved ${tiers.length} tier${tiers.length === 1 ? "" : "s"}.`
      : "Price removed — the product stays listed but cannot be quoted.",
  };
}

export async function uploadProductImage(
  _prev: EditOutcome | null, formData: FormData,
): Promise<EditOutcome> {
  const me = await currentSupplier();
  if (!me) return { ok: false, message: "No manufacturer is signed in." };
  const file = formData.get("image");
  if (!(file instanceof File) || !file.size) {
    return { ok: false, message: "Choose an image first." };
  }
  try {
    await w.addProductImage(
      me.id, String(formData.get("canonicalId") ?? ""),
      file.name, file.type, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  refresh(ALL_PATHS);
  return { ok: true, message: `${file.name} added.` };
}

export async function removeProductImage(imageId: string) {
  const me = await currentSupplier();
  if (!me) return;
  await w.deleteProductImage(me.id, imageId);
  refresh(ALL_PATHS);
}

// --- Product review ------------------------------------------------------

/** Run (or read back) the comparison behind the Open problems tab. */
export async function reviewProductAction(
  hospitalItemId: string, canonicalId: string, force = false,
): Promise<w.ComparisonResult> {
  const res = await w.reviewProduct(hospitalItemId, canonicalId, force);
  refresh(HOSPITAL_PATHS);
  return res;
}

export async function clearProblemAction(qId: string) {
  w.clearProblem(qId); refresh(ALL_PATHS);
}
export async function sendProblemAction(qId: string) {
  w.sendProblemToSupplier(qId); refresh(ALL_PATHS);
}
export async function postChatMessageAction(formData: FormData) {
  w.postChatMessage(formData); refresh(ALL_PATHS);
}

// --- Choosing a replacement ------------------------------------------------
//
// The choice is recorded inside the request; the analysis is not. It searches
// the web and can take a few minutes, so it is scheduled with `after()` to run
// once the response has gone back, and the page polls `replacementStatusAction`
// until it lands.

export interface ReplaceOutcome {
  ok: boolean; message: string; replacementId?: string;
  /** The suggestion pipeline had already analysed the pair; nothing is running. */
  precomputed?: boolean;
}

export async function selectReplacementAction(
  itemId: string, canonicalId: string,
): Promise<ReplaceOutcome> {
  try {
    const res = rep.selectReplacement(itemId, canonicalId);
    if (res.analysing) after(() => rep.runReplacementAnalysis(res.id));
    refresh([...HOSPITAL_PATHS, `/hospital/products/${canonicalId}`]);
    return {
      ok: true, message: "Replacement recorded.", replacementId: res.id,
      precomputed: Boolean(res.precomputed),
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function replacementStatusAction(replacementId: string): Promise<AnalysisStatus | null> {
  return replacementStatus(replacementId);
}

export async function rerunReplacementAction(replacementId: string) {
  if (rep.requestReanalysis(replacementId)) after(() => rep.runReplacementAnalysis(replacementId));
  refresh(HOSPITAL_PATHS);
}

export async function withdrawReplacementAction(replacementId: string): Promise<EditOutcome> {
  try { rep.withdrawReplacement(replacementId); }
  catch (e) { return { ok: false, message: (e as Error).message }; }
  refresh(ALL_PATHS);
  return { ok: true, message: "Replacement withdrawn." };
}

export async function signOffPointAction(qId: string) {
  rep.signOffPoint(qId); refresh(ALL_PATHS);
}

// --- Automatic suggestions ------------------------------------------------
//
// The staged pipeline (lib/matching/suggest.ts) runs after every upload, once
// the response has gone back: its cheap stages take a second, but each line's
// best match is then analysed in full, which takes minutes.

function suggestAfterResponse(trigger: string) {
  after(async () => {
    try { await runSuggestions(trigger); }
    catch (e) { console.error("[suggest] run failed:", e); }
  });
}

export async function runSuggestionsAction() {
  suggestAfterResponse("manual (admin)");
  refresh([...ADMIN_PATHS, "/hospital"]);
}

export async function suggestionsPendingAction(): Promise<boolean> {
  return suggestionsPending();
}

/** Hide a suggestion; the line's next-best match takes its place on the next pass. */
export async function dismissSuggestionAction(itemId: string, canonicalId: string) {
  dismissSuggestion(itemId, canonicalId);
  suggestAfterResponse("suggestion dismissed");
  refresh(HOSPITAL_PATHS);
}

export async function reconsiderSuggestionAction(itemId: string, canonicalId: string) {
  reconsiderSuggestion(itemId, canonicalId);
  suggestAfterResponse("suggestion reconsidered");
  refresh(HOSPITAL_PATHS);
}

/** Send a chosen replacement to approval — the §5 chain from here on. */
export async function orderReplacementAction(replacementId: string): Promise<EditOutcome> {
  try {
    const { status } = rep.orderReplacement(replacementId);
    refresh(ALL_PATHS);
    return {
      ok: true,
      message: status === "pending_clinical"
        ? "Ordered — waiting for clinical sign-off, then budget approval."
        : "Ordered — waiting for budget approval.",
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Messages ---------------------------------------------------------------
//
// Who is writing is the session's answer, never the client's: the supplier
// portal writes as the signed-in manufacturer, the hospital portal as its
// hospital. The client names only the other side of the conversation.

export async function postAsSupplierAction(
  hospitalId: string, body: string, questionId: string | null,
): Promise<EditOutcome> {
  const me = await currentSupplier();
  if (!me) return { ok: false, message: "No manufacturer is signed in." };
  try { msg.postMessage({ side: "supplier", hospitalId, supplierId: me.id, body, questionId }); }
  catch (e) { return { ok: false, message: (e as Error).message }; }
  refresh([...ALL_PATHS, "/hospital/messages"]);
  return { ok: true, message: "Sent." };
}

export async function postAsHospitalAction(
  supplierId: string, body: string, questionId: string | null,
): Promise<EditOutcome> {
  try { msg.postMessage({ side: "hospital", hospitalId: HOSPITAL_ID, supplierId, body, questionId }); }
  catch (e) { return { ok: false, message: (e as Error).message }; }
  refresh([...ALL_PATHS, "/hospital/messages"]);
  return { ok: true, message: "Sent." };
}

export async function markConversationReadAction(side: "hospital" | "supplier", counterpartId: string) {
  if (side === "supplier") {
    const me = await currentSupplier();
    if (me) msg.markRead("supplier", counterpartId, me.id);
  } else {
    msg.markRead("hospital", HOSPITAL_ID, counterpartId);
  }
  refresh(["/supplier", "/hospital", "/supplier/messages", "/hospital/messages"]);
}

/** A fingerprint of the viewer's inbox; the page re-renders when it moves. */
export async function inboxStampAction(side: "hospital" | "supplier"): Promise<string> {
  if (side === "supplier") {
    const me = await currentSupplier();
    return me ? msg.inboxStamp("supplier", me.id) : "";
  }
  return msg.inboxStamp("hospital", HOSPITAL_ID);
}
