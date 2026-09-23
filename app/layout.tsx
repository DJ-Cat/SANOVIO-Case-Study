import type { Metadata } from "next";
import "./globals.css";
import { DotGrid } from "./components/DotGrid";

export const metadata: Metadata = {
  title: "SANOVIO — The AI Platform for Procurement Optimization in Medical Supplies",
  description:
    "Harmonise procurement data, bundle demand across hospitals, source direct from the manufacturer.",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">
        {/* Interactive point grid, behind everything, on every page. */}
        <DotGrid />
        {children}
      </body>
    </html>
  );
}
