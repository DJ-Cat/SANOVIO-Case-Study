import Link from "next/link";
import { savingsBand } from "@/lib/pooling";
import { RISK_LABEL } from "@/lib/matching/thresholds";

// Re-exported so the many pages importing them from here keep working; the
// definitions live in a module a client component can import safely.
export { chf, price, num } from "./format";
export { Stamp, Mark, RevMark, Balloon, type Tone, type MarkKind } from "./marks";
import { Stamp, Mark } from "./marks";

/*
 * The page primitives, drawn the way sanovio.de draws its product: white
 * rounded cards lifted by a long soft shadow with a faint violet glow at
 * the edge, lavender light in the corners, pill chips, Manrope throughout.
 */

/**
 * A page's header: the title and what the page is for, the one action that
 * matters on the right, and — on a detail page — the facts that frame
 * everything below it, in a card of their own.
 */
export function Page({ title, lead, children, action, fields }: {
  title: string; lead?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
  /** Facts a detail page names up front — a manufacturer, a class, what it replaces. */
  fields?: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="space-y-7">
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 max-w-3xl flex-[1_1_28rem]">
            <h1 className="text-[1.85rem] font-bold leading-[1.15] tracking-[-0.02em] text-ink-950 [text-wrap:balance] dark:text-white">
              {title}
            </h1>
            {lead && (
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-500 dark:text-ink-300">{lead}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{action}</div>}
        </div>
        {fields && fields.length > 0 && (
          <dl className="card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
            {fields.map((f) => (
              <div key={f.label} className="min-w-0 px-5 py-3.5">
                <dt className="label">{f.label}</dt>
                <dd className="mt-1 text-[0.92rem] font-semibold leading-snug text-ink-900 [overflow-wrap:anywhere] dark:text-ink-50">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>
      {children}
    </div>
  );
}

/** A section of the page: a heading, a quiet count or note beside it, an action on the right. */
export function Section({ title, meta, action, children, className = "" }: {
  title: string; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[1.02rem] font-bold tracking-[-0.01em] text-ink-950 dark:text-white">{title}</h2>
        {meta && <span className="min-w-0 text-[0.8rem] text-ink-400 tnum">{meta}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** A row of figures in one card, split by soft dividers. */
export function Cells({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`card grid grid-cols-1 divide-y divide-[var(--line)] sm:divide-y-0 ${grid} sm:[&>*+*]:border-l sm:[&>*+*]:border-[var(--line)]`}>
      {children}
    </div>
  );
}

/**
 * Figures that describe a whole page, as a row of small cards — the value
 * large, its label and what it is measured against beneath.
 */
export function DataSheet({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="space-y-2.5">
      {title && <div className="text-[0.85rem] font-semibold text-ink-600 dark:text-ink-200">{title}</div>}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&:has(>:nth-child(5))]:lg:grid-cols-5">{children}</dl>
    </div>
  );
}

/** One figure: its value, its label, and what it is measured against. */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-[1.35rem] font-bold leading-tight tracking-[-0.01em] tnum text-ink-950 dark:text-white">{value}</dd>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-400" title={sub}>{sub}</div>}
    </div>
  );
}

/** An empty slot: the site's pale feature tile, with a sentence saying what would fill it. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel px-6 py-9 text-center text-sm leading-relaxed text-ink-500 dark:text-ink-300">
      {children}
    </div>
  );
}

const NOTE: Record<string, { box: string; head: string }> = {
  neutral: { box: "bg-ink-25 text-ink-700 shadow-[0_0_0_1px_var(--line)] dark:bg-ink-900 dark:text-ink-100", head: "text-ink-900 dark:text-white" },
  brand: { box: "bg-brand-50/70 text-brand-900 shadow-[0_0_0_1px_rgb(87_89_242/0.14)] dark:bg-brand-500/10 dark:text-brand-100", head: "text-brand-700 dark:text-brand-200" },
  warn: { box: "bg-amber-50 text-amber-900 shadow-[0_0_0_1px_rgb(245_158_11/0.22)] dark:bg-amber-500/10 dark:text-amber-100", head: "text-amber-800 dark:text-amber-200" },
  danger: { box: "bg-rose-50 text-rose-900 shadow-[0_0_0_1px_rgb(244_63_94/0.20)] dark:bg-rose-500/10 dark:text-rose-100", head: "text-rose-700 dark:text-rose-200" },
};

/**
 * A note the reader should act on: a softly tinted rounded box, a mark, an
 * optional bold lead-in, and an action on the right.
 */
export function Note({ children, tone = "neutral", label, mark, action, live = false, as = "div", href }: {
  children: React.ReactNode; tone?: "neutral" | "warn" | "danger" | "brand"; label?: string;
  mark?: React.ReactNode; action?: React.ReactNode; live?: boolean; as?: "div" | "a"; href?: string;
}) {
  const t = NOTE[tone];
  const body = (
    <>
      {mark && <span className="mt-[3px] shrink-0">{mark}</span>}
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        {label && <span className={`mr-1.5 font-bold ${t.head}`}>{label}</span>}
        {children}
      </span>
      {action && <span className="shrink-0 self-center">{action}</span>}
    </>
  );
  const cls = `flex items-start gap-3 rounded-xl px-4 py-3 ${t.box}`;
  return as === "a" && href
    ? <Link href={href} className={`${cls} transition-shadow hover:shadow-[0_0_0_1px_rgb(87_89_242/0.25),0_8px_24px_-10px_rgb(87_89_242/0.35)]`}>{body}</Link>
    : <div className={cls} aria-live={live ? "polite" : undefined}>{body}</div>;
}

/** One attribute: its name on the left, its value on the right, rows split by soft lines. */
export function Callout({ label, value, code = false, tone }: {
  label: string; value: React.ReactNode; code?: boolean; tone?: "danger" | "warn";
}) {
  const ink = tone === "danger" ? "text-rose-700 dark:text-rose-300"
    : tone === "warn" ? "text-amber-800 dark:text-amber-300" : "text-ink-900 dark:text-ink-50";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-ink-500 dark:text-ink-300">{label}</dt>
      <dd className={`min-w-0 text-right font-semibold tnum [overflow-wrap:anywhere] ${code ? "code" : ""} ${ink}`}>{value}</dd>
    </div>
  );
}

/** Identity or substitution — the most important distinction on the platform, as a pill. */
export function TypeBadge({ type }: { type: "identity" | "substitution" }) {
  return type === "identity"
    ? <Stamp tone="brand">Same article · direct</Stamp>
    : <Stamp tone="violet">Substitute · different article</Stamp>;
}

export function RiskBadge({ cls }: { cls: "I" | "IIa" | "IIb" | "III" }) {
  const tone = cls === "III" ? "danger" : cls === "IIb" ? "warn" : "neutral";
  return <span title={RISK_LABEL[cls]}><Stamp tone={tone}>MDR {cls}</Stamp></span>;
}

/**
 * A saving as a green pill, stronger in weight as the §4 band rises. With no
 * price to compare against, it says so rather than showing a dash.
 */
export function SavingsBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <Stamp tone="neutral" title="No saving can be stated without a price">No price yet</Stamp>;
  const band = savingsBand(pct);
  const strong = band === "strong" || band === "exceptional";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[12px] leading-[1.35] tnum ${
      band === "exceptional" ? "bg-emerald-600 font-bold text-white"
        : `bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200 ${strong ? "font-bold" : "font-semibold"}`}`}>
      −{pct.toFixed(1).replace(/\.0$/, "")} %
    </span>
  );
}

/** A table inside a card: quiet column heads, soft row dividers, tabular figures. */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left">
            {head.map((h) => <th key={h} className="label px-4 py-3 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A confidence score on its 0–100 scale: a small rounded meter with a tick
 * where the bar it must clear sits, and the score out of 100. The bar itself
 * is named in the tooltip, so "96 / 100" never reads as "96 out of 90".
 */
export function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  const ok = value >= threshold;
  return (
    <span className="inline-flex items-center gap-2 text-[0.8rem] tnum"
      title={`${value} out of 100 — ${ok ? "clears" : "below"} the bar of ${threshold}`}>
      <span className="relative h-1.5 w-16">
        <span className="absolute inset-0 overflow-hidden rounded-full bg-ink-50 dark:bg-ink-800">
          <span className={`absolute inset-y-0 left-0 rounded-full ${ok ? "bg-gradient-to-r from-brand-500 to-brand-400" : "bg-amber-400"}`}
            style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
        </span>
        <span aria-hidden className="absolute -inset-y-[3px] w-[2px] rounded-full bg-ink-400 dark:bg-ink-300"
          style={{ left: `calc(${Math.min(100, threshold)}% - 1px)` }} />
      </span>
      <span className={`font-semibold ${ok ? "text-ink-900 dark:text-ink-50" : "text-amber-800 dark:text-amber-300"}`}>{value}</span>
      <span className="text-ink-400">/ 100</span>
      <span className="sr-only">{ok ? `clears the bar of ${threshold}` : `below the bar of ${threshold}`}</span>
    </span>
  );
}

export { BUTTON, buttonClass, DIALOG } from "./controls";
import { BUTTON, buttonClass } from "./controls";

export function SubmitButton({ children, variant = "primary", size = "md", className = "", ...rest }: {
  children: React.ReactNode; variant?: keyof typeof BUTTON; size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`${buttonClass(variant, size)} ${className}`}>
      {children}
    </button>
  );
}
