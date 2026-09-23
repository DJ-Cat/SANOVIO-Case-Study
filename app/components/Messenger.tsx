"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConversationSummary, Thread, ThreadMessage, QuestionRef } from "@/lib/messaging";
import {
  postAsSupplierAction, postAsHospitalAction, markConversationReadAction, inboxStampAction,
} from "@/lib/actions";
import { Search, Send, Reply, Compose, Chat, Question, ArrowLeft, Close } from "./icons";

type Side = "hospital" | "supplier";

/**
 * A two-pane messenger, laid out the way Teams, Slack and every desktop mail
 * client are: conversations on the left, the open one on the right, the
 * composer pinned under it. Familiarity is the point — nobody should have to
 * learn how to answer a question.
 *
 * On a phone it is one pane at a time, like the mobile apps: the list, or the
 * conversation with a back arrow.
 */
export function Messenger({
  side, basePath, paramKey, conversations, activeId, explicit, thread, stamp, manufacturers = [],
}: {
  side: Side;
  basePath: string;
  /** The query parameter naming the other side: `h` (hospital) or `s` (supplier). */
  paramKey: "h" | "s";
  conversations: ConversationSummary[];
  /** The counterpart whose conversation is open. */
  activeId: string | null;
  /** Whether the URL named it (on a phone, only then is the list replaced by the thread). */
  explicit: boolean;
  thread: Thread | null;
  stamp: string;
  /** Hospital side: manufacturers it can start a chat with. */
  manufacturers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const counterpart = (c: { hospitalId: string; supplierId: string }) =>
    side === "hospital" ? c.supplierId : c.hospitalId;
  const active = conversations.find((c) => counterpart(c) === activeId) ?? null;

  // Live: poll a fingerprint of the inbox and re-render when it moves.
  useEffect(() => {
    const t = setInterval(async () => {
      const now = await inboxStampAction(side).catch(() => stamp);
      if (now !== stamp) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [side, stamp, router]);

  // Opening a conversation reads it.
  useEffect(() => {
    if (!activeId || !active?.unread) return;
    markConversationReadAction(side, activeId).then(() => router.refresh()).catch(() => {});
  }, [activeId, active?.unread, side, router]);

  return (
    <div data-thread-open={explicit ? "" : undefined}
      className={`grid ${explicit ? "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-10rem)]" : "h-[calc(100dvh-10rem)]"} min-h-[30rem] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-ink-50 bg-white/90 shadow-[0_1px_2px_rgba(16,18,40,.04),0_18px_40px_-24px_rgba(16,18,40,.22)] backdrop-blur-sm md:grid-cols-[19.5rem_minmax(0,1fr)] dark:border-ink-800 dark:bg-ink-900/90`}>
      <ConversationList
        side={side} basePath={basePath} paramKey={paramKey} conversations={conversations}
        activeId={activeId} manufacturers={manufacturers}
        draft={thread && activeId && !active ? { id: activeId, name: thread.name } : null}
        className={explicit ? "hidden md:flex" : "flex"} />
      <div className={`${explicit ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`}>
        {thread ? (
          <ThreadPane key={`${thread.hospitalId}|${thread.supplierId}`} side={side} thread={thread}
            backHref={basePath} counterpartId={activeId!} />
        ) : (
          <Placeholder side={side} empty={conversations.length === 0} />
        )}
      </div>
    </div>
  );
}

// --- conversation list ------------------------------------------------------

function ConversationList({ side, basePath, paramKey, conversations, activeId, manufacturers, draft, className }: {
  side: Side; basePath: string; paramKey: string; conversations: ConversationSummary[];
  activeId: string | null; manufacturers: { id: string; name: string }[];
  /** A chat opened with nobody's messages in it yet — shown in the list, as Teams does. */
  draft: { id: string; name: string } | null; className: string;
}) {
  const [filter, setFilter] = useState("");
  const [composing, setComposing] = useState(false);
  const q = filter.trim().toLowerCase();
  const shown = q
    ? conversations.filter((c) => `${c.name} ${c.lastBody ?? ""}`.toLowerCase().includes(q))
    : conversations;
  const counterpart = (c: ConversationSummary) => (side === "hospital" ? c.supplierId : c.hospitalId);
  const existing = new Set(conversations.map(counterpart));
  const startable = manufacturers.filter((m) => !existing.has(m.id)
    && (!q || m.name.toLowerCase().includes(q)));

  return (
    <aside className={`${className} min-h-0 flex-col border-r border-ink-50 bg-ink-25/70 dark:border-ink-800 dark:bg-ink-950/40`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink-950 dark:text-white">Messages</h1>
        {side === "hospital" && manufacturers.length > 0 && (
          <button onClick={() => setComposing((v) => !v)} aria-expanded={composing}
            title="New chat with a manufacturer"
            className={`grid h-8 w-8 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              composing ? "bg-brand-500 text-white" : "text-ink-500 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"}`}>
            <Compose className="h-4 w-4" />
            <span className="sr-only">New chat</span>
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={composing ? "Find a manufacturer" : "Search conversations"}
            aria-label={composing ? "Find a manufacturer" : "Search conversations"}
            className="w-full rounded-lg border border-transparent bg-white py-1.5 pl-8 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/15 dark:bg-ink-900 dark:text-ink-50" />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-color:var(--color-ink-100)_transparent] [scrollbar-width:thin]"
        aria-label="Conversations">
        {composing && (
          <div className="mb-2 rounded-xl border border-brand-100 bg-white p-1.5 dark:border-brand-500/30 dark:bg-ink-900">
            <div className="px-2 pb-1 pt-1 text-[11px] font-semibold text-ink-400">Start a chat with</div>
            {startable.length === 0 ? (
              <p className="px-2 pb-2 text-xs text-ink-400">
                {q ? "No manufacturer by that name." : "You already have a chat with every manufacturer here."}
              </p>
            ) : startable.map((m) => (
              <Link key={m.id} href={`${basePath}?${paramKey}=${m.id}`} scroll={false}
                onClick={() => { setComposing(false); setFilter(""); }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-ink-100 dark:hover:bg-brand-500/10">
                <Avatar name={m.name} size="sm" />
                <span className="truncate">{m.name}</span>
              </Link>
            ))}
          </div>
        )}

        {draft && !composing && (
          <div aria-current="page"
            className="mb-0.5 flex items-center gap-3 rounded-xl bg-white px-2.5 py-2.5 shadow-[0_1px_2px_rgba(16,18,40,.06)] ring-1 ring-ink-50 dark:bg-ink-800 dark:ring-ink-700">
            <Avatar name={draft.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{draft.name}</div>
              <div className="mt-0.5 truncate text-xs italic text-ink-400">New conversation</div>
            </div>
          </div>
        )}

        {shown.length === 0 && !composing && !draft ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">
            {q ? "No conversation matches." : side === "supplier"
              ? "No hospital has written to you yet."
              : "No conversations yet."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((c) => {
              const id = counterpart(c);
              const on = id === activeId;
              return (
                <li key={id}>
                  <Link href={`${basePath}?${paramKey}=${id}`} scroll={false}
                    aria-current={on ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                      on ? "bg-white shadow-[0_1px_2px_rgba(16,18,40,.06)] ring-1 ring-ink-50 dark:bg-ink-800 dark:ring-ink-700"
                         : "hover:bg-white/70 dark:hover:bg-ink-800/60"}`}>
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${c.unread ? "font-semibold text-ink-950 dark:text-white" : "font-medium text-ink-800 dark:text-ink-100"}`}>
                          {c.name}
                        </span>
                        <span className={`shrink-0 text-[11px] tnum ${c.unread ? "font-semibold text-brand-600 dark:text-brand-300" : "text-ink-400"}`}>
                          {c.lastAt ? listTime(c.lastAt) : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-xs ${c.unread ? "text-ink-700 dark:text-ink-100" : "text-ink-400"}`}>
                          {c.lastFromMe ? "You: " : ""}{c.lastBody}
                        </span>
                        {c.openQuestions > 0 && (
                          <span title={`${c.openQuestions} question${c.openQuestions === 1 ? "" : "s"} waiting for an answer`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                            <Question className="h-3 w-3" />{c.openQuestions} open
                          </span>
                        )}
                        {c.unread > 0 && (
                          <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white tnum"
                            aria-label={`${c.unread} unread`}>
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

// --- one conversation -----------------------------------------------------------

type Pending = { id: string; body: string; question: QuestionRef | null; failed?: boolean };

function ThreadPane({ side, thread, backHref, counterpartId }: {
  side: Side; thread: Thread; backHref: string; counterpartId: string;
}) {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<QuestionRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pending, addPending] = useOptimistic<Pending[], Pending>([], (list, p) => [...list, p]);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const firstOpen = thread.openQuestions[0] ?? null;

  // Stay pinned to the newest message, as a messenger does. The scroller is a
  // reversed flex column, so the browser itself starts it at the bottom and
  // keeps it there as messages arrive — no script racing the layout. Scroll
  // offsets therefore count from the bottom: 0 is the newest message.
  const count = thread.messages.length + pending.length;
  const stuck = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);
  useEffect(() => {
    const el = scroller.current, inner = log.current;
    if (!el || !inner) return;
    const grew = inner.scrollHeight - lastHeight.current;
    lastHeight.current = inner.scrollHeight;
    if (stuck.current) el.scrollTop = 0;
    // Reading further up when a message lands: hold the reader's place
    // rather than letting the new line shove the text they are reading.
    else if (grew > 0) el.scrollTop -= grew;
  }, [count]);

  const send = (body: string) => {
    const text = body.trim();
    if (!text) return;
    const question = replyTo;
    setError(null);
    setReplyTo(null);
    stuck.current = true;
    startTransition(async () => {
      addPending({ id: `p${Date.now()}`, body: text, question });
      // A dropped connection rejects rather than returning an outcome; it has
      // to land in the same place as a refusal, or the message just vanishes.
      const res = await (side === "supplier"
        ? postAsSupplierAction(counterpartId, text, question?.id ?? null)
        : postAsHospitalAction(counterpartId, text, question?.id ?? null))
        .catch(() => ({
          ok: false,
          message: typeof navigator !== "undefined" && !navigator.onLine
            ? "Not sent — you are offline. Your text is back in the box; send it again once you are back."
            : "Not sent — the server could not be reached. Your text is back in the box; try again.",
        }));
      if (!res.ok) {
        setError(res.message);
        setReplyTo(question);
        // Put the text back as if typed, so the composer's own state (the
        // send button, the height) follows it rather than seeing an empty box.
        const el = composer.current;
        if (el) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        // No refresh on failure: offline, a refresh Next.js cannot fetch falls
        // back to a full page load — which would throw away the text we just
        // put back in the box.
        return;
      }
      router.refresh();
    });
  };

  const jumpTo = (qid: string) => {
    const el = document.getElementById(`q-${qid}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.animate?.([{ boxShadow: "0 0 0 3px rgba(86,89,251,.35)" }, { boxShadow: "0 0 0 0 rgba(86,89,251,0)" }],
      { duration: 1200, easing: "cubic-bezier(.16,1,.3,1)" });
  };

  const items = useMemo(() => layout(thread.messages), [thread.messages]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-ink-50 px-4 py-3 dark:border-ink-800">
        <Link href={backHref} scroll={false} aria-label="Back to conversations"
          className="-ml-1 grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-50 md:hidden dark:text-ink-300 dark:hover:bg-ink-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Avatar name={thread.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-950 dark:text-white">{thread.name}</div>
          <div className="truncate text-xs text-ink-400">{thread.subtitle}</div>
        </div>
        {firstOpen && (
          <button onClick={() => jumpTo(firstOpen.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20">
            <Question className="h-3.5 w-3.5" />
            {thread.openQuestions.length} open question{thread.openQuestions.length === 1 ? "" : "s"}
          </button>
        )}
      </header>

      <div ref={scroller}
        onScroll={(e) => { stuck.current = Math.abs(e.currentTarget.scrollTop) < 80; }}
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-4 [scrollbar-color:var(--color-ink-100)_transparent] [scrollbar-width:thin] selection:bg-brand-100 sm:px-6"
        role="log" aria-live="polite" aria-label={`Conversation with ${thread.name}`}>
        <div ref={log} className="flex flex-1 flex-col">
        {items.length === 0 && pending.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center">
            <div className="max-w-xs">
              <Avatar name={thread.name} size="lg" />
              <p className="mt-3 text-sm font-medium text-ink-800 dark:text-ink-100">
                This is the start of your conversation with {thread.name}.
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Ask about a product, a price or a delivery. Questions sent from a product&apos;s open
                problems land here too.
              </p>
            </div>
          </div>
        ) : (
          <ol className="space-y-0.5">
            {items.map((it) => it.type === "day" ? (
              <li key={it.key} className="flex items-center gap-3 py-3" aria-label={it.label}>
                <span className="h-px flex-1 bg-ink-50 dark:bg-ink-800" />
                <span className="text-[11px] font-medium text-ink-400">{it.label}</span>
                <span className="h-px flex-1 bg-ink-50 dark:bg-ink-800" />
              </li>
            ) : (
              <MessageRow key={it.m.id} m={it.m} first={it.first} last={it.last} side={side}
                onReply={(q) => { setReplyTo(q); composer.current?.focus(); }} onJump={jumpTo} />
            ))}
            {pending.map((p) => (
              <li key={p.id} className="flex justify-end pt-2">
                <div className="max-w-[min(34rem,80%)] opacity-60">
                  {p.question && <Quote q={p.question} mine />}
                  <div className="rounded-2xl rounded-br-md bg-brand-50 px-3.5 py-2 text-sm text-ink-900 dark:bg-brand-500/20 dark:text-ink-50">
                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-ink-400">Sending…</div>
                </div>
              </li>
            ))}
          </ol>
        )}
        </div>
      </div>

      <Composer side={side} name={thread.name} replyTo={replyTo} error={error}
        textarea={composer} onCancelReply={() => setReplyTo(null)} onSend={send} />
    </>
  );
}

type Item =
  | { type: "day"; key: string; label: string }
  | { type: "msg"; m: ThreadMessage; first: boolean; last: boolean };

/**
 * Day dividers, and runs of messages from one author within a few minutes
 * collapsed under one name and time, as every messenger does. A question card
 * always stands on its own; it is a different kind of thing from chat.
 */
function layout(messages: ThreadMessage[]): Item[] {
  const out: Item[] = [];
  let day = "";
  messages.forEach((m, i) => {
    const d = new Date(m.createdAt);
    const key = d.toDateString();
    if (key !== day) { day = key; out.push({ type: "day", key: `d${key}`, label: dayLabel(d) }); }
    const prev = messages[i - 1], next = messages[i + 1];
    const joins = (a?: ThreadMessage, b?: ThreadMessage) => Boolean(a && b
      && a.fromMe === b.fromMe && a.authorName === b.authorName
      && a.kind !== "question" && b.kind !== "question"
      && new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString()
      && Math.abs(+new Date(b.createdAt) - +new Date(a.createdAt)) < 5 * 60_000);
    out.push({ type: "msg", m, first: !joins(prev, m), last: !joins(m, next) });
  });
  return out;
}

function MessageRow({ m, first, last, side, onReply, onJump }: {
  m: ThreadMessage; first: boolean; last: boolean; side: Side;
  onReply: (q: QuestionRef) => void; onJump: (qid: string) => void;
}) {
  const mine = m.fromMe;
  const time = clock(m.createdAt);

  if (m.kind === "question" && m.question) {
    return (
      <li className={`flex gap-2.5 pt-3 ${mine ? "justify-end" : ""}`}>
        {!mine && <Avatar name={m.authorName} size="sm" />}
        <div className="w-full max-w-[min(36rem,88%)]">
          <div className={`mb-1 flex items-baseline gap-2 text-[11px] ${mine ? "justify-end" : ""}`}>
            {!mine && <span className="font-semibold text-ink-700 dark:text-ink-100">{m.authorName}</span>}
            <span className="text-ink-400 tnum">{time}</span>
          </div>
          <QuestionCard q={m.question} side={side} mine={mine} onReply={onReply} />
        </div>
      </li>
    );
  }

  return (
    <li className={`flex gap-2.5 ${first ? "pt-2.5" : ""} ${mine ? "justify-end" : ""}`}>
      {!mine && (first ? <Avatar name={m.authorName} size="sm" /> : <span aria-hidden className="w-7 shrink-0" />)}
      <div className={`flex max-w-[min(34rem,80%)] flex-col ${mine ? "items-end" : "items-start"}`}>
        {first && (
          <div className="mb-1 flex items-baseline gap-2 text-[11px]">
            {!mine && <span className="font-semibold text-ink-700 dark:text-ink-100">{m.authorName}</span>}
            <span className="text-ink-400 tnum">{time}</span>
          </div>
        )}
        {m.kind === "reply" && m.question && <Quote q={m.question} mine={mine} onJump={onJump} />}
        <div title={first ? undefined : time}
          className={`px-3.5 py-2 text-sm leading-relaxed ${
            mine
              ? "bg-brand-50 text-ink-900 dark:bg-brand-500/20 dark:text-ink-50"
              : "border border-ink-50 bg-white text-ink-800 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          } ${bubbleShape(mine, first, last)}`}>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        </div>
      </div>
    </li>
  );
}

/** Rounded everywhere except where a bubble meets its neighbour in a run. */
function bubbleShape(mine: boolean, first: boolean, last: boolean): string {
  const base = "rounded-2xl";
  if (mine) return `${base} ${first ? "" : "rounded-tr-md"} ${last ? "" : "rounded-br-md"}`;
  return `${base} ${first ? "" : "rounded-tl-md"} ${last ? "" : "rounded-bl-md"}`;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "Waiting for an answer", tone: "text-amber-800 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-200" },
  answered: { label: "Answered", tone: "text-good-500 bg-good-100/40 dark:bg-good-500/15 dark:text-good-100" },
  cleared: { label: "Signed off", tone: "text-ink-500 bg-ink-50 dark:bg-ink-800 dark:text-ink-300" },
  skipped: { label: "Skipped", tone: "text-ink-500 bg-ink-50 dark:bg-ink-800 dark:text-ink-300" },
};

/**
 * A question as it arrives in the conversation: which product, which line it
 * would replace, whether it holds an order up, and where it stands. The reply
 * action answers this question and no other.
 */
function QuestionCard({ q, side, mine, onReply }: {
  q: QuestionRef; side: Side; mine: boolean; onReply: (q: QuestionRef) => void;
}) {
  const status = STATUS[q.status] ?? { label: q.status, tone: STATUS.skipped.tone };
  const open = q.status === "open";
  return (
    <article id={`q-${q.id}`}
      className={`overflow-hidden rounded-2xl border bg-white transition-shadow dark:bg-ink-800 ${
        open && q.type === "blocking" ? "border-rose-200 dark:border-rose-900/70" : "border-ink-100 dark:border-ink-700"}`}>
      <div className="flex items-start gap-2.5 border-b border-ink-50 bg-ink-25/80 px-3.5 py-2.5 dark:border-ink-700 dark:bg-ink-900/40">
        {q.imageId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/product-images/${q.imageId}`} alt=""
            className="h-8 w-8 shrink-0 rounded-md border border-ink-50 bg-white object-contain p-0.5 dark:border-ink-700" />
        ) : (
          <Question className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-ink-800 dark:text-ink-100">
            {q.productName ?? "Question"}
          </div>
          {q.lineName && (
            <div className="truncate text-[11px] text-ink-400">to replace {q.lineName}</div>
          )}
        </div>
        {q.type === "blocking" && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            open ? "bg-rose-600 text-white" : "bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300"}`}>
            Blocks the order
          </span>
        )}
      </div>
      <div className="px-3.5 py-3">
        {q.title && <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{q.title}</p>}
        <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700 dark:text-ink-200 ${q.title ? "mt-1" : ""}`}>
          {q.text}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-50 px-3.5 py-2 dark:border-ink-700">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
        {q.href && (
          <Link href={q.href}
            className="text-[11px] font-medium text-ink-500 underline-offset-2 hover:text-brand-600 hover:underline dark:text-ink-300 dark:hover:text-brand-300">
            {side === "supplier" ? "Your product page" : "Open the product"}
          </Link>
        )}
        {open && (side === "supplier" || mine) && (
          // Answering closes the question, so it is the one primary action on
          // the card. Following up on your own question is secondary.
          <button onClick={() => onReply(q)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              side === "supplier"
                ? "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700"
                : "text-ink-600 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-700"}`}>
            <Reply className="h-3.5 w-3.5" />
            {side === "supplier" ? "Answer" : "Follow up"}
          </button>
        )}
      </div>
    </article>
  );
}

/** The question a reply belongs to, shown above it; clicking it scrolls back to the card. */
function Quote({ q, mine, onJump }: { q: QuestionRef; mine: boolean; onJump?: (qid: string) => void }) {
  return (
    <button type="button" onClick={() => onJump?.(q.id)} disabled={!onJump}
      className={`mb-1 flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] text-ink-500 transition enabled:hover:bg-ink-50 dark:text-ink-300 dark:enabled:hover:bg-ink-800 ${mine ? "self-end" : ""}`}>
      <Reply className="h-3 w-3 shrink-0" />
      <span className="truncate">
        <span className="font-medium">{q.title ?? q.text}</span>
        {q.productName && <span className="text-ink-400"> · {q.productName}</span>}
      </span>
    </button>
  );
}

// --- composer ------------------------------------------------------------------

function Composer({ side, name, replyTo, error, textarea, onCancelReply, onSend }: {
  side: Side; name: string; replyTo: QuestionRef | null; error: string | null;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  onCancelReply: () => void; onSend: (body: string) => void;
}) {
  const [empty, setEmpty] = useState(true);
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  const submit = () => {
    const el = textarea.current;
    if (!el || !el.value.trim()) return;
    onSend(el.value);
    el.value = "";
    setEmpty(true);
    grow(el);
  };

  return (
    <div className="border-t border-ink-50 px-3 pb-3 pt-2 sm:px-4 dark:border-ink-800">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 dark:border-brand-500/30 dark:bg-brand-500/10">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold text-brand-800 dark:text-brand-100">
              {side === "supplier" ? "Answering" : "Following up on"} {replyTo.productName ? `· ${replyTo.productName}` : ""}
            </div>
            <div className="truncate text-brand-700/80 dark:text-brand-200/80">{replyTo.title ?? replyTo.text}</div>
            {side === "supplier" && (
              <div className="mt-0.5 text-[11px] text-brand-700/70 dark:text-brand-200/70">
                Sending this answers the question{replyTo.type === "blocking" ? " and lifts what it blocks" : ""}.
              </div>
            )}
          </div>
          <button onClick={onCancelReply} aria-label="Cancel reply"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-brand-700 hover:bg-brand-100 dark:text-brand-200 dark:hover:bg-brand-500/20">
            <Close className="h-3 w-3" />
          </button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-end gap-2 rounded-2xl border border-ink-100 bg-white px-3 py-2 transition focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/15 dark:border-ink-700 dark:bg-ink-950">
        <textarea ref={textarea} rows={1} maxLength={4000}
          placeholder={replyTo ? (side === "supplier" ? "Type your answer" : "Write your follow-up") : `Message ${name}`}
          aria-label="Message"
          onChange={(e) => { setEmpty(!e.target.value.trim()); grow(e.target); }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention every
            // messenger has taught its users. Composition input is left alone.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            if (e.key === "Escape" && replyTo) onCancelReply();
          }}
          className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400 dark:text-ink-50" />
        <button type="submit" disabled={empty} aria-label="Send"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 active:bg-brand-700 disabled:bg-ink-50 disabled:text-ink-300 dark:disabled:bg-ink-800">
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div className="mt-1 flex justify-between gap-3 px-1 text-[11px]">
        <span className="text-rose-700 dark:text-rose-300" role="alert">{error ?? ""}</span>
        <span className="hidden text-ink-400 sm:inline">Enter to send · Shift + Enter for a new line</span>
      </div>
    </div>
  );
}

// --- pieces -------------------------------------------------------------------

function Placeholder({ side, empty }: { side: Side; empty: boolean }) {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-sm">
        <Chat className="mx-auto h-10 w-10 text-ink-100 dark:text-ink-700" />
        <p className="mt-3 text-sm font-medium text-ink-700 dark:text-ink-100">
          {empty
            ? side === "supplier" ? "No conversations yet" : "Start a conversation"
            : "Choose a conversation"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">
          {empty
            ? side === "supplier"
              ? "When a hospital asks about one of your products, the question arrives here as a chat. Answering it there answers it on their side and lifts anything it was blocking."
              : "Send a question from a product's open problems, or start a chat with a manufacturer using the pencil above the list."
            : "Pick one from the list to read it and reply."}
        </p>
      </div>
    </div>
  );
}

const TONES = [
  "bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-100",
  "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
];

/** Initials on a tone picked from the name, so each organisation keeps its colour. */
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const letters = name.replace(/\(.*?\)/g, "").split(/[\s.\-]+/).filter((w) => /\p{L}/u.test(w))
    .map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const dims = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "mx-auto h-14 w-14 text-base" : "h-10 w-10 text-xs";
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold ${dims} ${TONES[h % TONES.length]}`}>
      {letters}
    </span>
  );
}

// --- time ----------------------------------------------------------------------

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });

/** In the list: a time today, a weekday this week, a date before that. */
function listTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dayLabel(d: Date): string {
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
