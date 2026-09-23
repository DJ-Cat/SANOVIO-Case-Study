import { PortalShell } from "@/app/components/PortalShell";
import { hospitalNavCounts } from "@/lib/queries";
import { currentHospital } from "@/lib/session";
import { unreadTotal } from "@/lib/messaging";
import { HOSPITAL_ID } from "@/lib/constants";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function HospitalLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getPrefs();
  const c = hospitalNavCounts();
  const me = currentHospital();
  return (
    <PortalShell
      portal={t("Hospital portal")}
      accent="text-brand-600 dark:text-brand-300"
      subtitle={me ? `${me.name} · ${t("A. Vogt (Buyer)")}` : t("A. Vogt (Buyer)")}
      items={[
        { href: "/hospital", label: t("Cockpit"), badge: c.recommendations },
        { href: "/hospital/catalogue", label: t("Catalogue") },
        { href: "/hospital/documents", label: t("Documents"), badge: c.review },
        { href: "/hospital/approvals", label: t("Approvals"), badge: c.approvals },
        { href: "/hospital/messages", label: t("Messages"), badge: unreadTotal("hospital", HOSPITAL_ID), tone: "unread" as const },
      ]}
    >
      {children}
    </PortalShell>
  );
}
