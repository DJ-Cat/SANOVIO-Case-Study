/**
 * Pills and marks — the small status vocabulary of the platform. No server
 * imports, so client components use them too.
 */

export type Tone = "neutral" | "brand" | "violet" | "warn" | "danger" | "good" | "solid-danger";

const PILL: Record<Tone, string> = {
  neutral: "bg-ink-50 text-ink-600 dark:bg-ink-800 dark:text-ink-200",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  // What blocks an order: the one pill that is filled, so it is never missed.
  "solid-danger": "bg-rose-600 text-white",
};

/**
 * A pill, as sanovio.de sets its chips: rounded, softly tinted, sentence
 * case. Tone carries the meaning; the words always say it too.
 */
export function Stamp({ children, tone = "neutral", title }: {
  children: React.ReactNode; tone?: Tone; title?: string;
}) {
  return (
    <span title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-[1.35] ${PILL[tone]}`}>
      {children}
    </span>
  );
}

export type MarkKind = "open" | "working" | "done" | "blocked" | "rejected" | "waiting";

/**
 * Status as a small drawn mark, so no state is told by colour alone: an open
 * ring, a half-filled ring while something works, a filled dot once done, a
 * triangle for what blocks, a cross for what was refused.
 */
export function Mark({ kind, className = "h-3 w-3", label }: { kind: MarkKind; className?: string; label?: string }) {
  const ink = kind === "blocked" || kind === "rejected" ? "text-rose-600 dark:text-rose-400"
    : kind === "done" ? "text-emerald-600 dark:text-emerald-400"
    : kind === "waiting" ? "text-amber-600 dark:text-amber-400"
    : kind === "working" ? "text-brand-500" : "text-ink-300";
  return (
    <svg viewBox="0 0 12 12" className={`${className} shrink-0 ${ink}`} role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      {kind === "open" && <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {kind === "waiting" && <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />}
      {kind === "working" && (<>
        <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 1.8a4.2 4.2 0 010 8.4z" fill="currentColor" />
      </>)}
      {kind === "done" && <circle cx="6" cy="6" r="4.4" fill="currentColor" />}
      {kind === "blocked" && <path d="M6 1.5l4.7 8.4H1.3z" fill="currentColor" strokeLinejoin="round" />}
      {kind === "rejected" && <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * A count of open points, as a pill: red with a warning mark when any of
 * them blocks the order, quiet grey when they are for information. With a
 * label it says what it counts ("7 blocking"), so the number is never bare.
 */
export function RevMark({ n, blocking = false, title, label }: { n: number; blocking?: boolean; title?: string; label?: string }) {
  return (
    <span title={title} aria-label={title}
      className={`inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-[11.5px] font-bold tnum ${
        blocking ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" : "bg-ink-50 text-ink-600 dark:bg-ink-800 dark:text-ink-200"}`}>
      {blocking && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden><path d="M6 1.5l4.7 8.4H1.3z" fill="currentColor" /></svg>
      )}
      {n}{label && <span className="font-semibold">{label}</span>}
    </span>
  );
}

/** A row's position number: quiet, in a soft round well; rose when the row blocks. */
export function Balloon({ n, blocking = false }: { n: number; blocking?: boolean }) {
  return (
    <span className={`inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold tnum ${
      blocking ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-ink-50 text-ink-400 dark:bg-ink-800 dark:text-ink-300"}`}>
      {n}
    </span>
  );
}
