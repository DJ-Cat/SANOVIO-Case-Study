import { PortalShell } from "@/app/components/PortalShell";
import { supplierNavCounts } from "@/lib/queries";
import { currentSupplier } from "@/lib/session";
import { unreadTotal } from "@/lib/messaging";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getPrefs();
  const me = await currentSupplier();
  const c = supplierNavCounts(me?.id ?? "");
  return (
    <PortalShell
      portal={t("Supplier portal")}
      accent="text-ink-500 dark:text-ink-300"
      subtitle={me ? `${me.name} · ${t("manufacturer workspace")}` : t("Manufacturer workspace")}
      items={[
        { href: "/supplier", label: t("Catalogue"), badge: c.unchecked },
        { href: "/supplier/upload", label: t("Upload catalogue") },
        { href: "/supplier/pricing", label: t("Pricing"), badge: c.unpriced },
        { href: "/supplier/messages", label: t("Messages"), badge: me ? unreadTotal("supplier", me.id) : 0, tone: "unread" as const },
      ]}
    >
      {children}
    </PortalShell>
  );
}
