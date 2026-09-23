"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string; label: string; hint?: string; badge?: number;
  /** "unread" counts messages, in the messenger's own blue; the default is "needs attention". */
  tone?: "attention" | "unread";
}

const EASE = "duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none";

export function Sidebar({ portal, subtitle, items, accent, demo = false }: {
  portal: string; subtitle: string; items: NavItem[]; accent: string;
  /** The demo edition, on its filled database: said on every page, so nobody mistakes it for the clean one. */
  demo?: boolean;
}) {
  // `null` is the pre-hydration state: the server cannot know the viewport, so
  // the first paint is decided by CSS alone — rail out on desktop, drawer away
  // on mobile. The effect below resolves it to the same thing the CSS already
  // rendered, so nothing moves; from then on the toggle is an ordinary boolean.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => setOpen(window.matchMedia("(min-width: 1024px)").matches), []);
  const pathname = usePathname();
  const activeHref = items
    .filter((it) => pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  // Off-screen by its own width plus the gap it floats in and its glow.
  const rail = open === null ? "-translate-x-[calc(100%+2rem)] lg:translate-x-0"
    : open ? "translate-x-0"
    : "-translate-x-[calc(100%+2rem)]";
  const spacer = open === false ? "lg:w-0" : "lg:w-[16.5rem]";

  return (
    <>
      {/* Layout spacer: the rail itself is fixed, so this is what the content
          column is actually pushed by — and what animates when it collapses. */}
      <div aria-hidden className={`hidden shrink-0 transition-[width] lg:block ${EASE} ${spacer}`} />

      <button
        onClick={() => setOpen((v) => !(v ?? true))}
        aria-label={open === false ? "Show menu" : "Hide menu"}
        aria-expanded={open !== false}
        className="fixed left-5 top-5 z-50 grid h-9 w-9 place-items-center rounded-xl bg-white text-ink-600 shadow-[0_0_0_1px_var(--line-strong),0_4px_14px_-6px_rgb(40_42_120/0.25)] transition hover:text-brand-600 dark:bg-ink-900 dark:text-ink-200"
      >
        {/* Phones: bars that fold into an X, because the drawer covers the
            page. Desktop: a panel glyph that collapses the rail beside it. */}
        <span className="lg:hidden"><Bars open={open === true} /></span>
        <span className="hidden lg:block"><PanelGlyph collapsed={open === false} /></span>
      </button>

      {open === true && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/30 backdrop-blur-[2px] lg:hidden" />
      )}

      {/* The rail: a white card floating off the page edge, as the site's nav bar floats. */}
      <aside className={`fixed inset-y-3 left-3 z-40 flex w-[15.25rem] flex-col rounded-3xl bg-[var(--sheet)] shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_20px_50px_-20px_rgb(40_42_120/0.30)] transition-transform ${EASE} ${rail}`}>

        <div className="flex h-14 flex-col items-end justify-center gap-1 px-4 pl-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sanovio-logo.svg" alt="SANOVIO" width={98} height={12} className="h-3 w-auto dark:brightness-[1.35]" />
          {demo && <DemoBadge />}
        </div>

        {/* Whose workspace this is. */}
        <div className="panel mx-3 mb-3 px-3.5 py-3">
          <div className={`text-[0.78rem] font-bold ${accent}`}>{portal}</div>
          <div className="mt-0.5 text-[0.8rem] leading-snug text-ink-600 dark:text-ink-200">{subtitle}</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label={portal}>
          <ul className="space-y-0.5">
            {items.map((it) => {
              // One item lit, the most specific one that matches: the portal
              // root prefixes every page in it, so a prefix test alone lit
              // "Catalogue" and "Messages" together.
              const active = it.href === activeHref;
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => { if (window.innerWidth < 1024) setOpen(false); }}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.9rem] transition ${
                      active
                        ? "bg-brand-50 font-bold text-brand-700 shadow-[0_0_0_1px_rgb(87_89_242/0.12)] dark:bg-brand-500/15 dark:text-brand-100"
                        : "font-medium text-ink-600 hover:bg-ink-25 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800/60 dark:hover:text-ink-50"}`}>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.badge ? (
                      <span className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tnum ${
                        it.tone === "unread" ? "bg-brand-500 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"}`}
                        aria-label={it.tone === "unread" ? `${it.badge} unread` : undefined}>
                        {it.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-3 pb-3">
          <Link href="/" className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-400 transition hover:bg-ink-25 hover:text-brand-600 dark:hover:bg-ink-800/60">
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Switch portal
          </Link>
        </div>
      </aside>
    </>
  );
}

/** Three bars that fold into an X: the outer two rotate through centre while
    the middle one fades out, so the toggle reads as one continuous motion. */
function Bars({ open }: { open: boolean }) {
  const bar = `absolute left-1/2 h-[1.6px] w-[15px] -translate-x-1/2 rounded-full bg-current transition-all ${EASE}`;
  return (
    <span className="relative block h-[18px] w-[18px]" aria-hidden>
      <span className={`${bar} ${open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-[4.2px]"}`} />
      <span className={`${bar} top-1/2 -translate-y-1/2 ${open ? "scale-x-0 opacity-0" : "opacity-100"}`} />
      <span className={`${bar} ${open ? "top-1/2 -translate-y-1/2 -rotate-45" : "top-[12.2px]"}`} />
    </span>
  );
}

/** A panel with its side column: the column shaded while the rail is shown. */
function PanelGlyph({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 18 18" className="h-[17px] w-[17px]" aria-hidden>
      <rect x="1.5" y="2.5" width="15" height="13" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 2.5v13" stroke="currentColor" strokeWidth="1.4" />
      {!collapsed && <rect x="3" y="4.5" width="2" height="9" rx="1" fill="currentColor" opacity="0.55" />}
    </svg>
  );
}

/** Marks the demo edition: its data is sample data, reset with `npm run demo:reset`. */
export function DemoBadge() {
  return (
    <span title="Demo edition — sample data. Reset it any time with npm run demo:reset."
      className="rounded-full bg-amber-100 px-2 py-[1px] text-[10.5px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
      Demo data
    </span>
  );
}
