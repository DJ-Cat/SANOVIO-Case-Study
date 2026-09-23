import Link from "next/link";
import { portalSummary } from "@/lib/queries";
import { isDemo } from "@/lib/edition";
import { getPrefs } from "@/lib/prefs";
import { PrefsSwitch } from "@/app/components/Prefs";

export const dynamic = "force-dynamic";

/**
 * The front door, drawn like sanovio.de's own: the wordmark, one line of
 * purpose, and the three portals as feature cards — an icon on a pale,
 * lavender-lit panel, who the portal is for, and what it currently holds.
 */
export default async function Landing() {
  const { t } = await getPrefs();
  const s = portalSummary();

  return (
    <div className="flex min-h-dvh items-center">
      <section className="mx-auto w-full max-w-[72rem] px-4 py-16 sm:px-8">
        <header className="mx-auto max-w-2xl text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sanovio-logo.svg" alt="SANOVIO" width={196} height={24} className="mx-auto h-6 w-auto dark:brightness-[1.35]" />
          {isDemo() && (
            <p className="mx-auto mt-5 w-fit rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-[0_0_0_1px_rgb(245_158_11/0.25)] dark:bg-amber-500/10 dark:text-amber-200">
              {t("Demo edition — filled with sample data, reset any time")}
            </p>
          )}
          <h1 className="mt-8 text-[2.4rem] font-bold leading-[1.1] tracking-[-0.025em] text-ink-950 [text-wrap:balance] dark:text-white">
            {t("Choose your portal")}
          </h1>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink-500 [text-wrap:pretty] dark:text-ink-300">
            {t("Hospitals and manufacturers work in separate portals. They share one harmonised product catalogue and nothing else — a manufacturer never sees a hospital's procurement strategy.")}
          </p>
          {/* Language and currency, chosen before anything else is read. */}
          <div className="mt-6"><PrefsSwitch /></div>
        </header>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          <PortalCard href="/hospital" icon={<HospitalIcon />} title={t("Hospital procurement")}
            body={t("Upload your article master, work the suggested replacements, clear what still needs a signature, and approve orders into the pool.")}
            stats={[[t("articles"), s.hospitalItems], [t("suggestions"), s.recommendations], [t("open reviews"), s.hospitalReview]]}
            cta={t("Enter hospital portal")} primary />
          <PortalCard href="/supplier" icon={<PackageIcon />} title={t("Manufacturer catalogue")}
            body={t("Upload your catalogue, confirm what extraction was unsure about, set volume pricing, and answer hospitals in Messages.")}
            stats={[[t("catalogue rows"), s.supplierItems], [t("products"), s.canonicalProducts], [t("open questions"), s.openQuestions]]}
            cta={t("Enter supplier portal")} />
          <PortalCard href="/admin" icon={<RouteIcon />} title={t("Platform operations")}
            body={t("Matching pipeline observability: which layer resolved what, what it cost, and the confidence thresholds in force.")}
            stats={[[t("products"), s.canonicalProducts], [t("links"), s.links], [t("match runs"), s.runs]]}
            cta={t("Enter operations")} />
        </ol>
      </section>
    </div>
  );
}

function PortalCard({ href, icon, title, body, stats, cta, primary = false }: {
  href: string; icon: React.ReactNode; title: string; body: string;
  stats: [string, number][]; cta: string; primary?: boolean;
}) {
  return (
    <li>
      <Link href={href}
        className="group card flex h-full flex-col p-2 transition-shadow duration-200 hover:shadow-[var(--shadow-glow-strong)]">
        <div className="panel relative grid h-40 place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/80 text-brand-600 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_8px_24px_-10px_rgb(87_89_242/0.45)] transition-transform duration-200 group-hover:-translate-y-0.5 dark:bg-ink-900/80 dark:text-brand-300">
            {icon}
          </span>
          <span aria-hidden className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-ink-500 transition group-hover:text-brand-600 dark:bg-ink-900/70">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M5 11l6-6M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4">
          <h2 className="text-[1.25rem] font-bold tracking-[-0.015em] text-ink-950 dark:text-white">{title}</h2>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">{body}</p>
          <p className="mt-4 flex flex-wrap gap-1.5">
            {stats.map(([k, v]) => (
              <span key={k} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-200">
                <span className="font-bold tnum text-ink-900 dark:text-ink-50">{v}</span> {k}
              </span>
            ))}
          </p>
          <span className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            primary ? "btn-gradient text-white"
              : "bg-white text-ink-700 shadow-[0_0_0_1px_var(--line-strong)] group-hover:text-brand-700 group-hover:shadow-[0_0_0_1px_var(--color-brand-200)] dark:bg-ink-900 dark:text-ink-100"}`}>
            {cta}
            <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 transition-transform group-hover:translate-x-0.5"><path d="M1.5 6h8M6.5 2.8L9.7 6 6.5 9.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </Link>
    </li>
  );
}

const ICON = { viewBox: "0 0 24 24", className: "h-7 w-7", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function HospitalIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 21V7a2 2 0 012-2h4V3h4v2h4a2 2 0 012 2v14" /><path d="M2 21h20" />
      <path d="M12 8v4M10 10h4" /><path d="M9 21v-4h6v4" /><path d="M7 14h.01M17 14h.01" />
    </svg>
  );
}
function PackageIcon() {
  return (
    <svg {...ICON}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /><path d="M7.5 5.5l9 5" />
    </svg>
  );
}
function RouteIcon() {
  return (
    <svg {...ICON}>
      <circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H16a3.5 3.5 0 000-7H8a3.5 3.5 0 010-7h7.5" />
    </svg>
  );
}
