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

export function Sidebar({ portal, subtitle, items, accent }: {
  portal: string; subtitle: string; items: NavItem[]; accent: string;
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

  const rail = open === null ? "-translate-x-full lg:translate-x-0"
    : open ? "translate-x-0"
    : "-translate-x-full";
  const spacer = open === false ? "lg:w-0" : "lg:w-64";

  return (
    <>
      {/* Layout spacer: the rail itself is fixed, so this is what the content
          column is actually pushed by — and what animates when it collapses. */}
      <div aria-hidden className={`hidden shrink-0 transition-[width] lg:block ${EASE} ${spacer}`} />

      <button
        onClick={() => setOpen((v) => !(v ?? true))}
        aria-label={open === false ? "Open menu" : "Close menu"}
        aria-expanded={open !== false}
        className="fixed left-3 top-3 z-50 grid h-9 w-9 place-items-center rounded-lg border border-ink-100 bg-white/90 text-ink-700 shadow-sm backdrop-blur transition hover:bg-ink-25 dark:border-ink-700 dark:bg-ink-900/90 dark:text-ink-100 dark:hover:bg-ink-800"
      >
        <Bars open={open !== false} />
      </button>

      {open === true && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/40 backdrop-blur-sm lg:hidden" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-50 bg-white/80 backdrop-blur-xl transition-transform dark:border-ink-800 dark:bg-ink-900/80 ${EASE} ${rail}`}>

        <div className="px-4 pb-3 pt-14">
          <div className={`truncate text-[11px] font-semibold uppercase tracking-wider ${accent}`}>
            {portal}
          </div>
          <div className="mt-1 text-xs text-ink-400">{subtitle}</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <ul className="space-y-0.5">
            {items.map((it) => {
              // One item lit, the most specific one that matches: the portal
              // root prefixes every page in it, so a prefix test alone lit
              // "Catalogue" and "Messages" together.
              const active = it.href === activeHref;
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => { if (window.innerWidth < 1024) setOpen(false); }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                      active
                        ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                        : "text-ink-600 hover:bg-ink-25 dark:text-ink-300 dark:hover:bg-ink-800"}`}>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.badge ? (
                      <span className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold tnum ${
                        it.tone === "unread" ? "bg-brand-500 text-white" : "bg-amber-400 text-amber-950"}`}
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

        <div className="border-t border-ink-50 px-4 py-3 text-[11px] leading-relaxed text-ink-400 dark:border-ink-800">
          <Link href="/" className="font-medium text-ink-500 hover:text-brand-600 dark:text-ink-300">
            ← Switch portal
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
