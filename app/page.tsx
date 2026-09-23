import Link from "next/link";
import { portalSummary } from "@/lib/queries";
import { Brand } from "./components/Brand";

export const dynamic = "force-dynamic";

export default function Landing() {
  const s = portalSummary();

  return (
    <div className="flex min-h-dvh items-center">
      <Brand />

      <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink-950 dark:text-white">
          Choose your portal
        </h1>
        <p className="mt-3 max-w-2xl text-ink-500 dark:text-ink-300">
          Hospitals and manufacturers work in separate portals. They share one harmonised product
          catalogue and nothing else — a manufacturer never sees a hospital&apos;s procurement strategy.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <PortalCard
            href="/hospital" tone="brand" label="Hospital"
            title="Procurement portal"
            body="Upload your article master, review what the AI could not resolve, work the recommendation feed, and approve orders for fulfilment."
            stats={[
              ["Articles", s.hospitalItems], ["Recommendations", s.recommendations], ["Open reviews", s.hospitalReview],
            ]}
            cta="Enter hospital portal" />
          <PortalCard
            href="/supplier" tone="slate" label="Manufacturer"
            title="Supplier portal"
            body="Upload your catalogue, confirm what extraction was unsure about, set volume pricing, and answer questions from hospitals."
            stats={[
              ["Catalogue rows", s.supplierItems], ["Products", s.canonicalProducts], ["Open questions", s.openQuestions],
            ]}
            cta="Enter supplier portal" />
          <PortalCard
            href="/admin" tone="slate" label="Operations"
            title="Platform operations"
            body="Matching pipeline observability: which layer resolved what, what it cost in LLM calls, and the confidence thresholds currently in force."
            stats={[["Products", s.canonicalProducts], ["Links", s.links], ["Match runs", s.runs]]}
            cta="Enter operations" />
        </div>
      </section>
    </div>
  );
}

function PortalCard({ href, label, title, body, stats, cta, tone }: {
  href: string; label: string; title: string; body: string;
  stats: [string, number][]; cta: string; tone: "brand" | "slate";
}) {
  return (
    <Link href={href} className="card group flex flex-col p-6 transition hover:shadow-md hover:ring-1 hover:ring-brand-200 dark:hover:ring-brand-500/40">
      <span className={`self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
        tone === "brand"
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
          : "bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-300"}`}>
        {label}
      </span>
      <h3 className="mt-3 text-lg font-semibold text-ink-950 dark:text-white">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">{body}</p>
      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-ink-50 pt-4 dark:border-ink-800">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-ink-300">{k}</dt>
            <dd className="text-lg font-semibold tnum text-ink-900 dark:text-ink-50">{v}</dd>
          </div>
        ))}
      </dl>
      <span className="mt-4 text-sm font-semibold text-brand-600 transition group-hover:text-brand-500 dark:text-brand-300">
        {cta} →
      </span>
    </Link>
  );
}
