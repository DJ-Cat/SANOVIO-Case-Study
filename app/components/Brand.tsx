import Link from "next/link";

/**
 * The platform wordmark, fixed top right on every page — the one place the
 * product names itself. Opposite the hamburger, so the two corners frame the
 * content column.
 */
export function Brand() {
  return (
    <Link href="/"
      className="fixed right-4 top-4 z-50 text-sm font-semibold uppercase tracking-[0.2em] text-ink-900 transition hover:text-brand-600 dark:text-ink-50 dark:hover:text-brand-300">
      SANOVIO
    </Link>
  );
}
