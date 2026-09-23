import { PortalShell } from "@/app/components/PortalShell";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      portal="SANOVIO operations"
      accent="text-ink-500 dark:text-ink-300"
      subtitle="Internal — pipeline and documents"
      items={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/pipeline", label: "Matching pipeline" },
        { href: "/admin/documents", label: "Uploaded documents" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
