import { Sidebar, type NavItem } from "./Sidebar";
import { Brand } from "./Brand";
import { Back } from "./Back";

/** Shared chrome for a portal: fixed left rail, content column beside it. */
export function PortalShell({ portal, subtitle, accent, items, children }: {
  portal: string; subtitle: string; accent: string; items: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar portal={portal} subtitle={subtitle} accent={accent} items={items} />
      <Brand />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6">
          {/* Above the title on every page in the portal, rather than left to
              each one to remember. The rail says where you are; this says how
              to get back out of wherever a link dropped you. */}
          <div className="mb-3" data-portal-back><Back /></div>
          {children}
        </main>
      </div>
    </div>
  );
}
