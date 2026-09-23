import { PortalShell } from "@/app/components/PortalShell";
import { hospitalNavCounts } from "@/lib/queries";
import { currentHospital } from "@/lib/session";
import { unreadTotal } from "@/lib/messaging";
import { HOSPITAL_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  const c = hospitalNavCounts();
  const me = currentHospital();
  return (
    <PortalShell
      portal="Hospital portal"
      accent="text-brand-600 dark:text-brand-300"
      subtitle={me ? `${me.name} · A. Vogt (Buyer)` : "A. Vogt (Buyer)"}
      items={[
        { href: "/hospital", label: "Cockpit", badge: c.recommendations },
        { href: "/hospital/catalogue", label: "Catalogue" },
        { href: "/hospital/documents", label: "Documents", badge: c.review },
        { href: "/hospital/approvals", label: "Approvals", badge: c.approvals },
        { href: "/hospital/messages", label: "Messages", badge: unreadTotal("hospital", HOSPITAL_ID), tone: "unread" as const },
      ]}
    >
      {children}
    </PortalShell>
  );
}
