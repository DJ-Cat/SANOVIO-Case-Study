import { Sidebar, type NavItem } from "./Sidebar";
import { Brand } from "./Brand";
import { Back } from "./Back";
import { isDemo } from "@/lib/edition";

/** Shared chrome for a portal: fixed left rail, content column beside it. */
export function PortalShell({ portal, subtitle, accent, items, children }: {
  portal: string; subtitle: string; accent: string; items: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar portal={portal} subtitle={subtitle} accent={accent} items={items} demo={isDemo()} />
      <Brand />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[78rem] px-4 pb-16 pt-[4.25rem] sm:px-6 lg:px-10">
          {/* Above the title on every page in the portal, rather than left to
              each one to remember. The rail says where you are; this says how
              to get back out of wherever a link dropped you. */}
          <div className="mb-3 empty:hidden" data-portal-back><Back /></div>
          {children}
        </main>
      </div>
    </div>
  );
}
