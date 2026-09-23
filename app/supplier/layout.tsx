import { PortalShell } from "@/app/components/PortalShell";
import { supplierNavCounts } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { unreadTotal } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const me = await currentSupplier();
  const c = supplierNavCounts(me?.id ?? "");
  return (
    <PortalShell
      portal="Supplier portal"
      accent="text-ink-500 dark:text-ink-300"
      subtitle={me ? `${me.name} · manufacturer workspace` : "Manufacturer workspace"}
      items={[
        { href: "/supplier", label: "Catalogue", badge: c.unchecked },
        { href: "/supplier/upload", label: "Upload catalogue" },
        { href: "/supplier/pricing", label: "Pricing", badge: c.unpriced },
        { href: "/supplier/messages", label: "Messages", badge: me ? unreadTotal("supplier", me.id) : 0, tone: "unread" as const },
      ]}
    >
      {children}
    </PortalShell>
  );
}
