import { PortalShell } from "@/app/components/PortalShell";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getPrefs();
  return (
    <PortalShell
      portal={t("SANOVIO operations")}
      accent="text-ink-500 dark:text-ink-300"
      subtitle={t("Internal — pipeline and documents")}
      items={[
        { href: "/admin", label: t("Overview") },
        { href: "/admin/pipeline", label: t("Matching pipeline") },
        { href: "/admin/documents", label: t("Uploaded documents") },
      ]}
    >
      {children}
    </PortalShell>
  );
}
