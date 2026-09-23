/**
 * Hospital ↔ manufacturer conversations.
 *
 * One conversation per (hospital, manufacturer) pair, as in any messenger:
 * a manufacturer sees what this hospital wrote to it and nothing from any
 * other hospital, and neither side ever sees the other's conversations with
 * third parties.
 *
 * A question is a message with a job. When a hospital sends one — a point
 * from a replacement analysis, an open problem on a product, a question on a
 * recommendation — it arrives in the conversation as a card naming the
 * product, and a reply to that card answers that exact question. That
 * replaces "the reply answers whatever was asked last", which answered the
 * wrong question the moment two were open.
 *
 * Framework-free, like workflow.ts: scripts/verify.ts drives it directly.
 */
import { db, id, nowIso, tx, row, rows } from "./db";
import { HOSPITAL_ID, BUYER } from "./constants";

export type Side = "hospital" | "supplier";

export interface ConversationSummary {
  hospitalId: string; supplierId: string;
  /** The other side, as the viewer sees them. */
  name: string; subtitle: string;
  lastBody: string | null; lastAt: string | null; lastFromMe: boolean;
  unread: number;
  /** Questions still waiting for the manufacturer. */
  openQuestions: number;
}

export interface QuestionRef {
  id: string; type: "blocking" | "non_blocking"; status: string;
  title: string | null; text: string; answerText: string | null;
  productName: string | null; lineName: string | null;
  /** The product's best photograph, when the catalogue had one. */
  imageId: string | null;
  /** Where the question lives on the viewer's side, when it has a page. */
  href: string | null;
}

export interface ThreadMessage {
  id: string; body: string; createdAt: string;
  authorName: string; fromMe: boolean;
  /** The question this message asks (a card) or replies to (a quote). */
  question: QuestionRef | null;
  kind: "message" | "question" | "reply";
}

export interface Thread {
  hospitalId: string; supplierId: string; name: string; subtitle: string;
  messages: ThreadMessage[];
  openQuestions: QuestionRef[];
}

const viewerOrg = (side: Side, supplierId: string) => (side === "hospital" ? HOSPITAL_ID : supplierId);

// --- read models ---------------------------------------------------------------

/**
 * The conversation list, newest first. For the hospital it is every
 * manufacturer it has written to or heard from; for a manufacturer, every
 * hospital that wrote to it. A manufacturer never starts one: it has no way
 * to know which hospitals exist, and should not.
 */
export function conversations(side: Side, orgId: string): ConversationSummary[] {
  const me = side === "hospital" ? HOSPITAL_ID : orgId;
  const where = side === "hospital" ? `m.hospital_id = ?` : `m.supplier_id = ?`;
  return rows<any>(
    `SELECT m.hospital_id, m.supplier_id,
            other.name AS other_name, other.city AS other_city, other.type AS other_type,
            MAX(m.created_at) AS last_at,
            (SELECT body FROM chat_messages x WHERE x.hospital_id = m.hospital_id
               AND x.supplier_id = m.supplier_id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_body,
            (SELECT author_org_id FROM chat_messages x WHERE x.hospital_id = m.hospital_id
               AND x.supplier_id = m.supplier_id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_author,
            (SELECT COUNT(*) FROM chat_messages x
               LEFT JOIN chat_reads r ON r.org_id = ? AND r.hospital_id = x.hospital_id
                                     AND r.supplier_id = x.supplier_id
               WHERE x.hospital_id = m.hospital_id AND x.supplier_id = m.supplier_id
                 AND x.author_org_id != ? AND (r.last_read_at IS NULL OR x.created_at > r.last_read_at)) AS unread,
            (SELECT COUNT(DISTINCT q.id) FROM chat_messages x JOIN questions q ON q.id = x.question_id
               WHERE x.hospital_id = m.hospital_id AND x.supplier_id = m.supplier_id
                 AND q.status = 'open') AS open_questions
     FROM chat_messages m
     JOIN organizations other ON other.id = ${side === "hospital" ? "m.supplier_id" : "m.hospital_id"}
     WHERE ${where}
     GROUP BY m.hospital_id, m.supplier_id
     ORDER BY last_at DESC`, me, me, me)
    .map((r) => ({
      hospitalId: r.hospital_id, supplierId: r.supplier_id,
      name: r.other_name, subtitle: subtitleFor(r.other_type, r.other_city),
      lastBody: r.last_body, lastAt: r.last_at, lastFromMe: r.last_author === me,
      unread: r.unread ?? 0, openQuestions: r.open_questions ?? 0,
    }));
}

function subtitleFor(type: string, city: string | null): string {
  const what = type === "hospital" ? "Hospital" : "Manufacturer";
  return city ? `${what} · ${city}` : what;
}

/** One conversation, oldest message first, as the viewer sees it. */
export function thread(side: Side, hospitalId: string, supplierId: string): Thread | null {
  const other = row<{ name: string; city: string | null; type: string }>(
    `SELECT name, city, type FROM organizations WHERE id = ?`,
    side === "hospital" ? supplierId : hospitalId);
  if (!other) return null;
  const me = viewerOrg(side, supplierId);

  const raw = rows<any>(
    `SELECT m.id, m.body, m.created_at, m.author_org_id, m.question_id,
            COALESCE(u.name, o.name) AS author_name
     FROM chat_messages m
     LEFT JOIN users u ON u.id = m.author_user_id
     LEFT JOIN organizations o ON o.id = m.author_org_id
     WHERE m.hospital_id = ? AND m.supplier_id = ?
     ORDER BY m.created_at ASC, m.rowid ASC`, hospitalId, supplierId);

  const refs = questionRefs(side, supplierId, [...new Set(raw.map((m) => m.question_id).filter(Boolean))]);
  const seen = new Set<string>();
  const messages: ThreadMessage[] = raw.map((m) => {
    const q = m.question_id ? refs.get(m.question_id) ?? null : null;
    // The first message carrying a question is the question itself; every
    // later one is a reply to it.
    const kind: ThreadMessage["kind"] = !q ? "message" : seen.has(q.id) ? "reply" : "question";
    if (q) seen.add(q.id);
    return {
      id: m.id, body: m.body, createdAt: m.created_at, authorName: m.author_name ?? "—",
      fromMe: m.author_org_id === me, question: q, kind,
    };
  });

  return {
    hospitalId, supplierId, name: other.name, subtitle: subtitleFor(other.type, other.city),
    messages,
    openQuestions: [...refs.values()].filter((q) => q.status === "open"),
  };
}

/**
 * What a question card shows: the product it is about, the line it would
 * replace, whether it blocks an order, and where it stands.
 */
function questionRefs(side: Side, supplierId: string, ids: string[]): Map<string, QuestionRef> {
  if (!ids.length) return new Map();
  const marks = ids.map(() => "?").join(",");
  const list = rows<any>(
    `SELECT q.id, q.type, q.status, q.title, q.text, q.answer_text, q.hospital_item_id,
            COALESCE(q.canonical_product_id, r.recommended_canonical_product_id) AS product_id,
            cp.canonical_name AS product_name,
            COALESCE(h.extracted_name, rh.extracted_name) AS line_name,
            COALESCE(q.hospital_item_id, r.hospital_item_id) AS line_id,
            q.recommendation_id,
            (SELECT pi.id FROM product_images pi WHERE pi.canonical_product_id = cp.id
               ORDER BY CASE pi.confidence WHEN 'certain' THEN 0 WHEN 'likely' THEN 1 ELSE 2 END,
                        CASE pi.role WHEN 'primary' THEN 0 WHEN 'variant' THEN 1 ELSE 2 END LIMIT 1) AS image_id,
            (SELECT s.id FROM supplier_catalog_items s WHERE s.canonical_product_id = cp.id
               AND s.supplier_id = ? ORDER BY s.created_at LIMIT 1) AS supplier_item_id
     FROM questions q
     LEFT JOIN recommendations r ON r.id = q.recommendation_id
     LEFT JOIN canonical_products cp ON cp.id = COALESCE(q.canonical_product_id, r.recommended_canonical_product_id)
     LEFT JOIN hospital_purchase_items h ON h.id = q.hospital_item_id
     LEFT JOIN hospital_purchase_items rh ON rh.id = r.hospital_item_id
     WHERE q.id IN (${marks})`, supplierId, ...ids);
  return new Map(list.map((q) => [q.id, {
    id: q.id, type: q.type, status: q.status, title: q.title ?? null, text: q.text,
    answerText: q.answer_text ?? null, productName: q.product_name ?? null, lineName: q.line_name ?? null,
    imageId: q.image_id ?? null,
    href: side === "hospital"
      ? q.recommendation_id
        ? `/hospital/recommendations/${q.recommendation_id}`
        : q.product_id ? `/hospital/products/${q.product_id}?item=${q.line_id ?? ""}&tab=problems` : null
      : q.supplier_item_id ? `/supplier/products/${q.supplier_item_id}` : null,
  }]));
}

/** Messages the viewer has not read, across every conversation — the sidebar badge. */
export function unreadTotal(side: Side, orgId: string): number {
  if (!orgId) return 0;
  return conversations(side, orgId).reduce((n, c) => n + c.unread, 0);
}

/**
 * A cheap fingerprint of everything the viewer's inbox shows. The page polls
 * it and re-renders only when it moves, so a message from the other portal
 * appears within seconds without anything being pushed.
 */
export function inboxStamp(side: Side, orgId: string): string {
  const col = side === "hospital" ? "hospital_id" : "supplier_id";
  const me = side === "hospital" ? HOSPITAL_ID : orgId;
  const r = row<{ n: number; last: string | null; q: string | null }>(
    `SELECT COUNT(*) AS n, MAX(created_at) AS last,
            (SELECT GROUP_CONCAT(q.status) FROM questions q WHERE q.id IN
               (SELECT question_id FROM chat_messages WHERE ${col} = ?)) AS q
     FROM chat_messages WHERE ${col} = ?`, me, me);
  return `${r?.n ?? 0}|${r?.last ?? ""}|${r?.q ?? ""}`;
}

/** Manufacturers the hospital can start a conversation with: those with products here. */
export function manufacturersToWrite(): { id: string; name: string }[] {
  return rows<{ id: string; name: string }>(
    `SELECT o.id, o.name FROM organizations o
     WHERE o.type = 'supplier' AND o.channel = 'manufacturer'
       AND EXISTS (SELECT 1 FROM canonical_products cp WHERE cp.manufacturer_id = o.id)
     ORDER BY o.name`).map((r) => ({ id: r.id, name: r.name }));
}

// --- writes -----------------------------------------------------------------------

export interface PostInput {
  side: Side; hospitalId: string; supplierId: string; body: string;
  /** Replying to this question. A manufacturer's reply answers it. */
  questionId?: string | null;
}

/**
 * Post a message. The author is the viewer's side, never chosen by the form:
 * a manufacturer can only write as itself, and only into a conversation with
 * a hospital that already wrote to it.
 */
export function postMessage(input: PostInput): { id: string } {
  const body = input.body.trim();
  if (!body) throw new Error("A message needs some text.");
  if (body.length > 4000) throw new Error("That message is too long — 4,000 characters at most.");
  const { side, hospitalId, supplierId } = input;
  if (side === "hospital" && hospitalId !== HOSPITAL_ID) throw new Error("Not your conversation.");
  const supplier = row<{ id: string }>(
    `SELECT id FROM organizations WHERE id = ? AND type = 'supplier'`, supplierId);
  if (!supplier) throw new Error("That manufacturer does not exist.");
  if (side === "supplier" && !row(`SELECT 1 FROM chat_messages WHERE hospital_id = ? AND supplier_id = ?`,
      hospitalId, supplierId)) {
    throw new Error("A manufacturer can only reply to a hospital that wrote to it.");
  }

  // A reply may only point at a question that belongs to this conversation.
  const q = input.questionId
    ? row<{ id: string; recommendation_id: string | null; status: string }>(
        `SELECT q.id, q.recommendation_id, q.status FROM questions q
         WHERE q.id = ? AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.question_id = q.id
           AND m.hospital_id = ? AND m.supplier_id = ?)`, input.questionId, hospitalId, supplierId)
    : undefined;
  if (input.questionId && !q) throw new Error("That question is not part of this conversation.");

  const authorOrg = side === "hospital" ? HOSPITAL_ID : supplierId;
  const authorUser = side === "hospital"
    ? BUYER
    : row<{ id: string }>(`SELECT id FROM users WHERE organization_id = ? AND role = 'supplier_user' LIMIT 1`,
        supplierId)?.id ?? null;

  const msgId = id("msg");
  const conn = db();
  tx(() => {
    conn.prepare(
      `INSERT INTO chat_messages (id,hospital_id,supplier_id,question_id,author_org_id,author_user_id,body,created_at)
       VALUES (?,?,?,?,?,?,?,?)`)
      .run(msgId, hospitalId, supplierId, q?.id ?? null, authorOrg, authorUser, body, nowIso());
    if (side === "supplier" && q && q.status === "open") {
      conn.prepare(`UPDATE questions SET answer_text=?, answered_by=?, status='answered' WHERE id=?`)
        .run(body, authorUser, q.id);
      // The §5 red gate: a recommendation held by this question opens once no
      // blocking question on it is left unanswered.
      if (q.recommendation_id) {
        const open = row<{ n: number }>(
          `SELECT COUNT(*) AS n FROM questions WHERE recommendation_id = ? AND type = 'blocking'
             AND status = 'open'`, q.recommendation_id)!.n;
        if (open === 0) {
          conn.prepare(`UPDATE recommendations SET status = 'in_progress', updated_at = ?
                        WHERE id = ? AND status = 'blocked'`).run(nowIso(), q.recommendation_id);
        }
      }
    }
    // Writing is reading: your own message never counts as unread to you,
    // and neither does anything you answered.
    markRead(side, hospitalId, supplierId);
  });
  return { id: msgId };
}

/** The viewer has seen everything in this conversation up to now. */
export function markRead(side: Side, hospitalId: string, supplierId: string): void {
  db().prepare(
    `INSERT INTO chat_reads (org_id, hospital_id, supplier_id, last_read_at) VALUES (?,?,?,?)
     ON CONFLICT(org_id, hospital_id, supplier_id) DO UPDATE SET last_read_at = excluded.last_read_at`)
    .run(viewerOrg(side, supplierId), hospitalId, supplierId, nowIso());
}
