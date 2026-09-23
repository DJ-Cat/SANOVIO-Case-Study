"use client";

import { useEffect } from "react";

/**
 * "Review points" takes the buyer to the point that needs them, not to the
 * top of the tab.
 *
 * The click and the arrival can be a page apart — the tab may not be open
 * yet, and the browse-time comparison only renders its points once it has
 * run — so the click leaves a request behind and the scroller, mounted on
 * the Open problems tab, answers it once there is a point to land on. The
 * target is the first point still blocking the order, then the first point
 * at all.
 */

const EVENT = "sanovio:review-points";
/** How long a request waits for points to appear before it is dropped. */
const WAIT_MS = 15_000;

let requestedAt = 0;

export function requestPointsScroll() {
  requestedAt = Date.now();
  window.dispatchEvent(new Event(EVENT));
}

function target(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-point][data-blocking="true"]')
    ?? document.querySelector<HTMLElement>("[data-point]");
}

export function PointsScroller() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const land = (el: HTMLElement) => {
      requestedAt = 0;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    };

    const answer = () => {
      if (!requestedAt || Date.now() - requestedAt > WAIT_MS) return;
      const el = target();
      if (el) { land(el); return; }
      // Not rendered yet: wait for the points rather than guess at a position.
      observer?.disconnect();
      observer = new MutationObserver(() => {
        const found = target();
        if (found) { observer?.disconnect(); land(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      clearTimeout(timer);
      timer = setTimeout(() => { observer?.disconnect(); requestedAt = 0; }, WAIT_MS);
    };

    answer();
    window.addEventListener(EVENT, answer);
    return () => {
      window.removeEventListener(EVENT, answer);
      observer?.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return null;
}
