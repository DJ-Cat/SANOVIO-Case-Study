"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "./icons";

/**
 * "Back" that means the previous page, and still works when there isn't one.
 *
 * Going back matters most where the page you came from held state the URL of
 * this one does not: a product opened from a search result should return to
 * that result, not to an empty cockpit. So the control prefers real history.
 *
 * But a product page is also a link somebody pastes to a colleague, and on a
 * cold load there is nothing behind it. It is therefore rendered as a genuine
 * anchor to the portal it belongs to — right-clickable, middle-clickable, and
 * correct without JavaScript — whose click is intercepted only once we know an
 * in-app entry exists to go back to.
 */

/**
 * Module scope, so it survives the remounts of client-side navigation and
 * resets on a full page load — which is exactly the lifetime of the history
 * stack we are asking about.
 */
let lastPath: string | null = null;
let navigatedInApp = false;

/** The portal a path belongs to; the chooser at the root is above all of them. */
function parentOf(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 1 ? `/${segments[0]}` : "/";
}

export function Back({ href, label = "Back" }: { href?: string; label?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) navigatedInApp = true;
    lastPath = pathname;
    // A same-origin referrer covers the first hop after a full page load, which
    // the counter above cannot have seen.
    setCanGoBack(navigatedInApp || document.referrer.startsWith(`${location.origin}/`));
  }, [pathname]);

  // A portal's own pages are one click away in the rail; Back is for the
  // detail pages a link drops you into.
  if (!href && pathname.split("/").filter(Boolean).length <= 2) return null;

  const fallback = href ?? parentOf(pathname);

  return (
    <a
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (canGoBack) router.back(); else router.push(fallback);
      }}
      className="group -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium
                 text-ink-400 transition hover:bg-white hover:text-ink-900 hover:shadow-[0_0_0_1px_var(--line)]
                 dark:hover:bg-ink-900 dark:hover:text-ink-100"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      {label}
    </a>
  );
}
