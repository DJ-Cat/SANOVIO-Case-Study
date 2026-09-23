import Link from "next/link";
import { BAND_CLASS, savingsBand } from "@/lib/pooling";
import type { RecCard } from "@/lib/queries";
import { RISK_LABEL } from "@/lib/matching/thresholds";

// Re-exported so the many pages importing them from here keep working; the
// definitions live in a module a client component can import safely.
export { chf, price, num } from "./format";
import { chf, num } from "./format";

export function Page({ title, lead, children, action }: {
  title: string; lead?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {/* Top-aligned so a page action sits level with the title, not with the
          last line of a lead paragraph that may wrap. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {lead && <p className="mt-1 max-w-3xl text-sm text-ink-400 dark:text-ink-300">{lead}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tnum">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-8 text-center text-sm text-ink-400">{children}</div>
  );
}

export function TypeBadge({ type }: { type: "identity" | "substitution" }) {
  return type === "identity" ? (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950 dark:text-sky-300">
      Identity · same article, direct
    </span>
  ) : (
    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950 dark:text-violet-300">
      Substitution · different article
    </span>
  );
}

export function RiskBadge({ cls }: { cls: "I" | "IIa" | "IIb" | "III" }) {
  const tone = cls === "III" ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
    : cls === "IIb" ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    : "bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-300";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`} title={RISK_LABEL[cls]}>MDR {cls}</span>;
}

export function SavingsBadge({ pct }: { pct: number }) {
  const band = savingsBand(pct);
  return (
    <span className={`rounded-lg px-2.5 py-1 text-lg font-bold tnum ${BAND_CLASS[band]}`}>
      −{pct.toFixed(1).replace(/\.0$/, "")}%
    </span>
  );
}

/** §4 recommendation card. */
export function RecommendationCard({ rec }: { rec: RecCard }) {
  return (
    <Link href={`/hospital/recommendations/${rec.id}`}
      className="card block p-4 transition hover:shadow-md hover:ring-1 hover:ring-ink-200 dark:hover:ring-ink-600">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={rec.type} />
        <RiskBadge cls={rec.mdrClass} />
        {rec.requiresClinical && (
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            Clinical review required
          </span>
        )}
        {rec.openBlocking > 0 && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {rec.openBlocking} blocking question{rec.openBlocking > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-xs text-ink-300">
            Currently: {rec.itemName} · via {rec.currentSupplier}
          </div>
          <div className="mt-1 truncate text-lg font-semibold leading-snug">{rec.recommendedName}</div>
          <div className="mt-0.5 text-sm text-ink-400">{rec.supplierName} · direct</div>
        </div>
        <div className="shrink-0 text-right">
          <SavingsBadge pct={rec.savingsPct} />
          <div className="mt-1.5 text-xs text-ink-400 tnum">
            CHF {chf(rec.baseline, 3)} → <span className="font-semibold text-ink-600 dark:text-ink-200">{chf(rec.offered, 3)}</span>
          </div>
          <div className="text-xs text-ink-300 tnum">CHF {num(rec.savingsAmount)} / year</div>
        </div>
      </div>

      {rec.matchConfidence !== null && (
        <div className="mt-3 border-t border-ink-50 pt-2.5 text-xs text-ink-400 dark:border-ink-800">
          Match confidence {rec.matchConfidence}
        </div>
      )}
    </Link>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
            {head.map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50 dark:divide-ink-800">{children}</tbody>
      </table>
    </div>
  );
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  const ok = value >= threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-600">
        <div className={`h-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`tnum text-xs ${ok ? "text-ink-400" : "font-semibold text-amber-700 dark:text-amber-400"}`}>{value}</span>
    </div>
  );
}

export function SubmitButton({ children, variant = "primary", ...rest }: {
  children: React.ReactNode; variant?: "primary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    ghost: "border border-ink-200 text-ink-600 hover:bg-ink-25 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800",
    danger: "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950",
  }[variant];
  return (
    <button {...rest} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}
