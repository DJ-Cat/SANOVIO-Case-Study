"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  replacementStatusAction, rerunReplacementAction, withdrawReplacementAction,
  signOffPointAction, sendProblemAction, suggestionsPendingAction, orderReplacementAction,
} from "@/lib/actions";
import type { Orderability } from "@/lib/replacement";
import { num } from "./format";
import { Money, usePrefs } from "./Prefs";
import { pick } from "@/lib/i18n";
import { say } from "@/lib/i18n/user-error";
import type { ReplacementView, ReplacementPointView, AnalysisStatus, SuggestionView } from "@/lib/queries";
import { Spinner } from "./OpenProblems";
import { requestPointsScroll } from "./PointsScroller";
import { Stamp, RevMark, Mark, Balloon, VerdictStamp } from "./marks";
import { buttonClass, DIALOG, POINT_EDGE } from "./controls";

const POLL_MS = 3000;

/**
 * Keeps a server-rendered page current while an analysis runs.
 *
 * Asks for the state only — a few bytes — and refreshes the page once it
 * changes, so the finished points arrive through the same render as
 * everything else instead of a second client-side copy of them.
 */
export function AnalysisPoller({ ids }: { ids: { id: string; status: AnalysisStatus }[] }) {
  const router = useRouter();
  const watching = ids.filter((i) => i.status === "pending" || i.status === "running");
  const key = watching.map((i) => `${i.id}:${i.status}`).join(",");

  useEffect(() => {
    if (!watching.length) return;
    let stopped = false;
    const t = setInterval(async () => {
      const now = await Promise.all(watching.map((i) => replacementStatusAction(i.id).catch(() => i.status)));
      if (!stopped && now.some((s, n) => s !== watching[n].status)) router.refresh();
    }, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/**
 * While the suggestion pipeline is still working, re-render the page every
 * few seconds so matches and their analyses appear as they land, and stop
 * once it reports it is done.
 */
export function SuggestionsPoller({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    const t = setInterval(async () => {
      ticks++;
      const still = await suggestionsPendingAction().catch(() => true);
      if (!still || ticks % 3 === 0) router.refresh();
      if (!still) clearInterval(t);
    }, POLL_MS + 1000);
    return () => clearInterval(t);
  }, [pending, router]);
  return null;
}

/**
 * The status card above a product's tabs once it has been chosen as a
 * replacement: where the analysis of the switch stands, and ordering once it
 * is settled. Its glow takes the state's colour.
 */
export function ReplacementBanner({ view, problemsHref, orderability }: {
  view: ReplacementView; problemsHref: string; orderability?: Orderability | null;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { status, counts } = view;

  if (status === "pending" || status === "running") {
    return (
      <Strip rule="brand" live>
        <Spinner small />
        <Stamp tone="brand">{t("Calculating")}</Stamp>
        <p className="min-w-0 flex-1 text-sm text-ink-600 dark:text-ink-200">
          {pick(locale,
            <>Checking price, replaceability, safety and correctness against{" "}
              <span className="font-medium text-ink-900 dark:text-ink-50">{view.lineName}</span>. The
              points appear here when it is done.</>,
            <>Preis, Ersetzbarkeit, Sicherheit und Korrektheit werden geprüft gegen{" "}
              <span className="font-medium text-ink-900 dark:text-ink-50">{view.lineName}</span>. Die
              Punkte erscheinen hier, sobald die Prüfung fertig ist.</>)}
        </p>
        <AnalysisPoller ids={[{ id: view.id, status }]} />
      </Strip>
    );
  }

  if (status === "failed") {
    return (
      <Strip rule="danger">
        <Mark kind="rejected" className="h-3.5 w-3.5" />
        <Stamp tone="danger">{t("Not calculated")}</Stamp>
        <p className="min-w-0 flex-1 text-sm text-ink-700 dark:text-ink-100">
          {t("The match for {line} could not be calculated.", { line: view.lineName })}
          {view.error && <span className="block text-xs text-ink-400">{view.error}</span>}
        </p>
        <button disabled={pending} onClick={() => start(async () => {
            await rerunReplacementAction(view.id); router.refresh();
          })}
          className={buttonClass("ghost", "sm")}>
          {pending ? t("Starting…") : t("Try again")}
        </button>
      </Strip>
    );
  }

  const settled = counts.open === 0;
  return (
    <Strip rule={settled ? "good" : counts.blockingOpen ? "danger" : "neutral"}>
      {settled
        ? <Stamp tone="good">{counts.total ? t("Signed off") : t("Nothing to settle")}</Stamp>
        : counts.blockingOpen
          ? <Stamp tone="solid-danger">{t("{n} blocking", { n: counts.blockingOpen })}</Stamp>
          : <Stamp tone="neutral">{t("Open")}</Stamp>}
      <p className="min-w-0 flex-1 text-sm text-ink-600 tnum dark:text-ink-200">
        {settled
          ? counts.total ? t("All {n} points signed off.", { n: counts.total }) : t("The analysis raised nothing to settle.")
          : <><span className="font-semibold text-ink-900 dark:text-ink-50">{counts.open}</span> {counts.open === 1 ? t("open point") : t("open points")}
            {counts.signedOff > 0 && <span className="text-ink-400"> · {t("{n} signed off", { n: counts.signedOff })}</span>}</>}
      </p>
      <Link href={problemsHref} scroll={false} onClick={requestPointsScroll}
        className={buttonClass("ghost", "sm")}>{t("Review points")}</Link>
      {orderability && <OrderControl view={view} o={orderability} />}
    </Strip>
  );
}

const GLOW: Record<string, string> = {
  brand: "shadow-[var(--shadow-glow-strong)]",
  danger: "shadow-[0_0_0_1px_rgb(244_63_94/0.22),0_10px_36px_-10px_rgb(244_63_94/0.35),0_2px_6px_rgb(20_21_40/0.04)]",
  good: "shadow-[0_0_0_1px_rgb(16_185_129/0.22),0_10px_36px_-10px_rgb(16_185_129/0.30),0_2px_6px_rgb(20_21_40/0.04)]",
  neutral: "shadow-[var(--shadow-glow)]",
};

/** A status card: white, rounded, its glow in the state's colour. The words inside say the state. */
function Strip({ children, rule, live = false }: { children: React.ReactNode; rule: keyof typeof GLOW; live?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl bg-[var(--sheet)] px-5 py-3.5 ${GLOW[rule]}`}
      aria-live={live ? "polite" : undefined}>
      {children}
    </div>
  );
}

const ORDER_LABEL: Record<string, string> = {
  pending_clinical: "awaiting clinical sign-off",
  pending_approval: "awaiting budget approval",
  approved: "approved", pooled: "approved · in the pool",
  sanovio_fulfillment: "in fulfilment", fulfilled: "delivered",
};

/**
 * Ordering the chosen replacement: the button, why it is not available yet,
 * or where the order now stands. The order itself joins the ordinary §5
 * chain — clinical sign-off where required, then budget approval, then pool.
 */
function OrderControl({ view, o }: { view: ReplacementView; o: Orderability }) {
  const { t, locale, money } = usePrefs();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (o.order) {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t hair pt-3 text-xs">
        <span className="inline-flex items-center gap-2">
          <Stamp tone="brand">{t("Ordered")}</Stamp>
          <span className="text-ink-600 dark:text-ink-200">{ORDER_LABEL[o.order.status] ? t(ORDER_LABEL[o.order.status]) : o.order.status}</span>
        </span>
        <Link href="/hospital/approvals" className="font-semibold text-brand-600 underline dark:text-brand-300">
          {t("Open approvals")}
        </Link>
      </div>
    );
  }

  const confirm = async () => {
    setBusy(true); setError(null);
    const res = await orderReplacementAction(view.id)
      .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setOpen(false);
    router.refresh();
  };

  const dearer = o.savingsPct != null && o.savingsPct < 0;
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t hair pt-3">
      <span className="min-w-0 text-xs text-ink-500 dark:text-ink-300">
        {o.canOrder
          ? t("{price} per unit · {volume} a year", { price: money(o.unitPrice!, o.currency), volume: num(o.volume) }) +
            (o.savingsPct != null ? ` · ${dearer ? "+" : "−"}${Math.abs(o.savingsPct)}%` : "")
          : say(t, o.reasonMessages[0])}
      </span>
      <button onClick={() => setOpen(true)} disabled={!o.canOrder}
        title={o.canOrder ? undefined : o.reasonMessages.map((m) => say(t, m)).join(" ")}
        className={buttonClass("primary", "sm")}>
        {t("Order this replacement")}
      </button>
      {open && (
        <ConfirmDialog title={t("Order this replacement?")} confirmLabel={t("Place order")} busy={busy}
          onCancel={() => { setOpen(false); setError(null); }} onConfirm={confirm}
          body={<>
            <span className="block">
              {pick(locale,
                <>{view.productName} replaces <span className="font-medium">{view.lineName}</span>,
                  sourced direct from {o.supplierName ?? view.manufacturer}.</>,
                <>{view.productName} ersetzt <span className="font-medium">{view.lineName}</span>,
                  direkt bezogen von {o.supplierName ?? view.manufacturer}.</>)}
            </span>
            <span className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-ink-25 dark:bg-ink-800/60 px-3 py-2.5 text-xs tnum">
              <span className="text-ink-400">{t("Annual volume")}</span><span className="text-right">{t("{n} units", { n: num(o.volume) })}</span>
              <span className="text-ink-400">{t("Unit price")}</span>
              <span className="text-right"><Money amount={o.unitPrice!} from={o.currency} /> <span className="text-ink-400">{t("at the pool's current tier")}</span></span>
              <span className="text-ink-400">{t("Today")}</span><span className="text-right"><Money amount={o.baseline!} from={o.currency} /></span>
              <span className="text-ink-400">{dearer ? t("Extra cost per year") : t("Saving per year")}</span>
              <span className={`text-right font-semibold ${dearer ? "text-rose-700 dark:text-rose-300" : "text-good-500 dark:text-good-100"}`}>
                <Money amount={Math.abs(o.annualSavings ?? 0)} from={o.currency} digits={0} />
              </span>
            </span>
            <span className="mt-3 block text-xs">
              {o.requiresClinical
                ? t("A change of article at this risk class goes to clinical sign-off first, then to budget approval.")
                : t("It goes to budget approval, then joins the pool.")}
              {view.counts.open > 0 && ` ${view.counts.open === 1
                ? t("1 non-blocking point is still open; it does not hold the order up.")
                : t("{n} non-blocking points are still open; they do not hold the order up.", { n: view.counts.open })}`}
            </span>
            {error && (
              <span className="mt-3 block rounded-xl bg-rose-50 shadow-[0_0_0_1px_rgb(244_63_94/0.22)] dark:bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                {error}
              </span>
            )}
          </>} />
      )}
    </div>
  );
}

const CATEGORY: Record<string, { label: string; blurb: string }> = {
  safety: { label: "Safety", blurb: "Risk class, sterility, materials, recalls" },
  replaceability: { label: "Replaceability", blurb: "Will it do the same job" },
  price: { label: "Price", blurb: "What the switch costs" },
  correctness: { label: "Correctness", blurb: "Can the data be trusted" },
  other: { label: "Other questions", blurb: "Raised before the replacement was chosen" },
};
const ORDER = ["safety", "replaceability", "price", "correctness", "other"];

/**
 * The Open problems tab for a chosen replacement: one row per point — its
 * number, what it says, where it stands, when and by whom it last moved —
 * grouped by what it is about, in one card.
 */
export function ReplacementPoints({ view, productName, canSend, readOnly = false, ordered = false, replacing }: {
  view: ReplacementView; productName: string; canSend: boolean;
  /** The line being replaced, drawn at the head of the verdict's card. */
  replacing?: React.ReactNode;
  /** A suggestion's pre-calculated analysis: nothing is chosen, so nothing is signable. */
  readOnly?: boolean;
  /** Once ordered, the analysis is what the order was placed on; it is not re-run or withdrawn. */
  ordered?: boolean;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  if (view.status === "pending" || view.status === "running") {
    return (
      <div className="space-y-5">
        {replacing && <div className="card overflow-hidden">{replacing}</div>}
        <div className="panel flex flex-col items-center gap-3 py-14 text-center">
          <Spinner />
          <p className="text-sm font-medium text-ink-600 dark:text-ink-200">
            {t("Calculating the match against {line}", { line: view.lineName })}
          </p>
          <p className="max-w-sm text-xs text-ink-400">
            {t("Reading both specifications, the prices, and what the manufacturer publishes about this article.")}
          </p>
        </div>
      </div>
    );
  }

  const groups = ORDER
    .map((key) => ({ key, points: view.points.filter((p) => (p.category ?? "other") === key) }))
    .filter((g) => g.points.length);
  // One running number across the groups, so "point 4" means one thing.
  let rev = 0;

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        {replacing}
        <div className="px-5 py-4">
          {view.status === "failed" ? (
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {view.error ? t("The analysis failed: {error}", { error: view.error }) : t("The analysis failed.")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="label">{t("AI verdict")}</span>
                {view.verdict && <VerdictStamp verdict={view.verdict} t={t} />}
                {view.confidence != null && <span className="text-xs text-ink-400 tnum">{t("{n} % confidence", { n: view.confidence })}</span>}
              </div>
              <p className="mt-2 max-w-[75ch] text-[0.95rem] leading-relaxed text-ink-800 dark:text-ink-100">{view.summary}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-stretch gap-y-1 border-t hair px-2 py-1.5 text-[11px] text-ink-500 dark:text-ink-300">
          {!readOnly && !ordered && <span className="flex items-center gap-2 px-3 py-2">
            <button disabled={pending} onClick={() => start(async () => {
                await rerunReplacementAction(view.id); router.refresh();
              })}
              className={buttonClass("ghost", "sm")}>
              {t("Run again")}
            </button>
            <button disabled={pending} onClick={() => setWithdrawing(true)}
              className={buttonClass("danger", "sm")}>
              {t("Withdraw replacement")}
            </button>
          </span>}
          {view.adapter && <Cell label={t("Analysed by")}>{view.adapter}</Cell>}
          {view.webSearches > 0 && <Cell label={t("Web searches")}><span className="tnum">{view.webSearches}</span></Cell>}
          {view.finishedAt && <Cell label={t("Date")}><span className="code">{new Date(view.finishedAt).toLocaleString("de-CH")}</span></Cell>}
        </div>
        {withdrawError && (
          <p className="border-t hair px-5 py-2 text-xs text-rose-700 dark:text-rose-300">{withdrawError}</p>
        )}
        {view.sources.length > 0 && (
          <details className="border-t hair px-5 py-2.5 text-[11px] text-ink-400">
            <summary className="cursor-pointer select-none">
              {view.sources.length === 1 ? t("1 page consulted") : t("{n} pages consulted", { n: view.sources.length })}
            </summary>
            <ul className="mt-1.5 space-y-0.5">
              {view.sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noreferrer noopener"
                    className="text-brand-600 hover:underline dark:text-brand-300">{s.title}</a>
                  <span className="ml-1.5 text-ink-300">{host(s.url)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {readOnly && view.points.length > 0 && (
        <div className="rounded-xl bg-brand-50/70 px-4 py-3 shadow-[0_0_0_1px_rgb(87_89_242/0.14)] dark:bg-brand-500/10">
          <p className="text-sm leading-relaxed text-brand-900 dark:text-brand-100">
            {pick(locale,
              <>Calculated in advance, because this is the best match found for {view.lineName}. Choose{" "}
                <span className="font-semibold">Replace with this</span> to sign these points off or
                send them to {view.manufacturer} — the analysis is taken over as it is, not run again.</>,
              <>Im Voraus berechnet, weil dies der beste Treffer für {view.lineName} ist. Wählen Sie{" "}
                <span className="font-semibold">{t("Replace with this")}</span>, um diese Punkte abzuzeichnen
                oder an {view.manufacturer} zu senden — die Analyse wird unverändert übernommen, nicht neu berechnet.</>)}
          </p>
        </div>
      )}

      {view.points.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50/70 px-4 py-7 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <Mark kind="done" className="h-3.5 w-3.5" /> {t("Nothing stands out. The analysis found no issue with this switch.")}
        </div>
      ) : (
        <div className="space-y-6">
          {view.counts.blockingOpen > 0 && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-[0_0_0_1px_rgb(244_63_94/0.20)] dark:bg-rose-500/10 dark:text-rose-100">
              <Stamp tone="solid-danger">{t("{n} blocking", { n: view.counts.blockingOpen })}</Stamp>
              {t("Should not be ordered until signed off. A manufacturer's answer still needs your sign-off.")}
            </p>
          )}
          {groups.map((g) => (
            <section key={g.key} className="space-y-2.5">
              <h3 className="flex flex-wrap items-baseline gap-x-2 px-1">
                <span className="text-[0.95rem] font-bold text-ink-900 dark:text-white">{t(CATEGORY[g.key].label)}</span>
                <span className="text-xs text-ink-500 dark:text-ink-300">{t(CATEGORY[g.key].blurb)}</span>
              </h3>
              <ol className="space-y-3">
                {g.points.map((p) => (
                  <Point key={p.id} n={++rev} p={p} productName={productName} canSend={canSend}
                    manufacturer={view.manufacturer} readOnly={readOnly}
                    raisedAt={view.finishedAt} adapter={view.adapter}
                    onDone={() => router.refresh()} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {withdrawing && (
        <ConfirmDialog
          title={t("Withdraw this replacement?")}
          body={t("{line} goes back to having no replacement. Points you signed off or sent stay on record; the rest of the analysis is discarded.", { line: view.lineName })}
          confirmLabel={t("Withdraw")} danger
          onCancel={() => setWithdrawing(false)}
          onConfirm={async () => {
            const res = await withdrawReplacementAction(view.id);
            setWithdrawing(false);
            if (!res.ok) { setWithdrawError(res.message); return; }
            router.replace(`/hospital/products/${view.canonicalId}?item=${view.itemId}`);
            router.refresh();
          }} />
      )}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5">
      <span className="label block text-[11px]">{label}</span>
      <span className="mt-0.5 block text-[12px] text-ink-700 dark:text-ink-100">{children}</span>
    </span>
  );
}

/** Where a point stands, as the phase stamp in its revision row. */
function phase(p: ReplacementPointView): { word: string; tone: "danger" | "neutral" | "brand" | "good" | "warn" } {
  if (p.status === "cleared") return { word: "Signed off", tone: "good" };
  if (p.status === "answered") return { word: "Answered", tone: "brand" };
  if (p.sentAt) return { word: "With manufacturer", tone: "brand" };
  if (p.severity === "blocking") return { word: "Blocking", tone: "danger" };
  return { word: "Open", tone: "neutral" };
}

function Point({ n, p, productName, manufacturer, canSend, readOnly, raisedAt, adapter, onDone }: {
  n: number; p: ReplacementPointView; productName: string; manufacturer: string; canSend: boolean;
  readOnly: boolean; raisedAt: string | null; adapter: string | null; onDone: () => void;
}) {
  const { t, locale } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const signedOff = p.status === "cleared";
  const blocking = p.severity === "blocking" && !signedOff;
  const ph = phase(p);
  // The last thing that happened to the point, and who did it.
  const moved = signedOff
    ? { at: p.clearedAt, by: p.clearedBy ?? t("Hospital") }
    : p.status === "answered" ? { at: p.sentAt, by: manufacturer }
    : p.sentAt ? { at: p.sentAt, by: t("sent by you") }
    : { at: raisedAt, by: adapter ? t("analysis") : t("raised") };

  const act = (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    fn(p.id).then(onDone).finally(() => { setBusy(false); setConfirming(false); });
  };

  return (
    <li data-point data-blocking={blocking || undefined}
      className={`scroll-mt-20 rounded-2xl px-5 py-4 ${POINT_EDGE[blocking ? "blocking" : signedOff ? "done" : "open"]}`}>
      <div className="flex gap-4">
        <span className="pt-0.5"><Balloon n={n} blocking={blocking} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-[1_1_18rem]">
              <p className={`text-[0.98rem] font-semibold leading-snug ${signedOff ? "text-ink-500 dark:text-ink-300" : "text-ink-950 dark:text-white"}`}>{p.title ?? p.text}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500 dark:text-ink-300">
                <Stamp tone={ph.tone}>{t(ph.word)}</Stamp>
                <span className="font-medium">{p.routedTo === "supplier" ? t("Manufacturer can clarify") : t("Your decision")}</span>
                {moved.at && <span className="tnum">· {new Date(moved.at).toLocaleDateString("de-CH")} · {moved.by}</span>}
              </p>
            </div>

            {/* The point's actions, where the eye lands after its title. */}
            {!signedOff && !readOnly ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button onClick={() => setConfirming(true)} disabled={busy} className={buttonClass("primary")}>
                  {t("Sign off")}
                </button>
                <button onClick={() => act(sendProblemAction)}
                  disabled={busy || Boolean(p.sentAt) || !canSend}
                  title={!canSend ? t("This product has no manufacturer on the platform to ask") : undefined}
                  className={buttonClass("secondary")}>
                  {p.sentAt ? t("Sent") : t("Send to supplier")}
                </button>
              </div>
            ) : null}
          </div>

          {p.detail && (
            <p className={`mt-3 max-w-[75ch] text-[0.94rem] leading-relaxed ${signedOff ? "text-ink-500 dark:text-ink-300" : "text-ink-700 dark:text-ink-200"}`}>{p.detail}</p>
          )}
          {p.sources.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {p.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}
                  className="text-brand-600 hover:underline dark:text-brand-300">
                  {host(s.url)}
                </a>
              ))}
            </p>
          )}
          {p.answerText && (
            <div className="mt-3 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-[0.94rem] leading-relaxed text-ink-800 dark:bg-brand-500/10 dark:text-ink-100">
              <span className="mr-1.5 font-bold text-brand-700 dark:text-brand-200">{manufacturer}</span>{p.answerText}
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t("Sign off this point?")}
          body={<>
            {t("You are recording that the hospital accepts {product} as a replacement despite this point. It stays on record with your name and the time, and is not sent to {manufacturer}.", { product: productName, manufacturer })}
            <span className="mt-3 flex gap-2.5 rounded-xl bg-ink-25 dark:bg-ink-800/60 px-3 py-2 text-xs leading-relaxed text-ink-700 dark:text-ink-100">
              <Balloon n={n} blocking={blocking} />
              <span>{p.title ?? p.text}</span>
            </span>
            {p.category === "safety" && (
              <span className="mt-3 block text-xs font-semibold text-rose-700 dark:text-rose-300">
                {t("A safety point is recorded as the clinical sign-off, not the buyer's.")}
              </span>
            )}
          </>}
          confirmLabel={t("Yes, sign it off")} busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => act(signOffPointAction)} />
      )}
    </li>
  );
}

function ConfirmDialog({ title, body, confirmLabel, danger = false, busy = false, onCancel, onConfirm }: {
  title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = usePrefs();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return createPortal((
    <div role="dialog" aria-modal="true" aria-label={title} className={DIALOG.scrim}>
      <div className={DIALOG.panel}>
        <h2 className={`${DIALOG.head} text-base font-semibold text-ink-950 dark:text-white`}>{title}</h2>
        <div className={DIALOG.body}>{body}</div>
        <div className={DIALOG.foot}>
          <button onClick={onCancel} disabled={busy} className={buttonClass("ghost")}>{t("Cancel")}</button>
          <button onClick={onConfirm} disabled={busy}
            className={danger ? `${buttonClass("primary")} !bg-rose-600 hover:!bg-rose-700` : buttonClass("primary")}>
            {busy ? t("Saving…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * The card above a product that the suggestion pipeline matched to one of
 * the hospital's lines, before anyone chose it: why the platform matched it
 * — in full, since the rationale is the thing a buyer checks — and how far
 * the analysis got. It glows violet, the colour of a substitute.
 */
export function SuggestionBanner({ view, problemsHref }: {
  view: SuggestionView; problemsHref: string;
}) {
  const { t } = usePrefs();
  const a = view.analysis;
  const analysing = a?.status === "pending" || a?.status === "running";
  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--sheet)] shadow-[0_0_0_1px_rgb(139_92_246/0.18),0_12px_40px_-12px_rgb(124_88_246/0.40),0_2px_6px_rgb(20_21_40/0.04)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-gradient-to-r from-violet-50/80 via-brand-50/50 to-transparent px-5 py-3 dark:from-violet-500/10 dark:via-brand-500/5">
        {view.relation === "identical" ? <Stamp tone="brand">{t("Same article")}</Stamp> : <Stamp tone="violet">{t("Substitute")}</Stamp>}
        <Stamp tone="neutral">{t("Suggested")}</Stamp>
        <span className="text-xs text-ink-500 tnum dark:text-ink-300">{t("{n} % match", { n: view.confidence })}</span>
        <span className="ml-auto flex items-center gap-3">
          {analysing ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-200">
              <Spinner small /> {t("Analysing the switch…")}
            </span>
          ) : a?.status === "done" ? (
            <span className="inline-flex items-center gap-2 text-xs tnum text-ink-600 dark:text-ink-200">
              <span><span className="font-semibold">{a.counts.total}</span> {a.counts.total === 1 ? t("point") : t("points")}</span>
              {a.counts.blockingOpen > 0 && <Stamp tone="solid-danger">{t("{n} blocking", { n: a.counts.blockingOpen })}</Stamp>}
            </span>
          ) : null}
          {a?.status === "done" && (
            <Link href={problemsHref} scroll={false} onClick={requestPointsScroll}
              className={buttonClass("ghost", "sm")}>{t("See points")}</Link>
          )}
        </span>
      </div>
      <div className="flex items-start gap-3 px-5 py-3.5">
        <span className="label shrink-0 pt-[2px]">{t("Why")}</span>
        <p className="max-w-[80ch] text-sm leading-relaxed text-ink-700 dark:text-ink-100">{view.rationale}</p>
      </div>
      <SuggestionsPoller pending={analysing} />
    </div>
  );
}
