import Link from "next/link";
import { isDemo } from "@/lib/edition";
import { DemoBadge } from "./Sidebar";

/**
 * The SANOVIO wordmark, top right on phones, where the rail that carries it
 * on desktop is folded away. The site's own vector file, in its own violet.
 */
export function Brand() {
  return (
    <Link href="/" aria-label="SANOVIO — choose a portal"
      className="fixed right-5 top-[1.6rem] z-30 rounded-md opacity-90 transition-opacity hover:opacity-100 lg:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/sanovio-logo.svg" alt="SANOVIO" width={98} height={12} className="h-3 w-auto dark:brightness-[1.35]" />
      {isDemo() && <span className="mt-1 flex justify-end"><DemoBadge /></span>}
    </Link>
  );
}
