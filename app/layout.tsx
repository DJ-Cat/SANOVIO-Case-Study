import type { Metadata } from "next";
import "./globals.css";
import { DotGrid } from "./components/DotGrid";
import { manrope } from "./fonts";
import { PrefsProvider } from "./components/Prefs";
import { getPrefs } from "@/lib/prefs";

export const metadata: Metadata = {
  title: "SANOVIO — The AI Platform for Procurement Optimization in Medical Supplies",
  description:
    "Harmonise procurement data, bundle demand across hospitals, source direct from the manufacturer.",
  icons: { icon: "/logo.png" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, currency, rates } = await getPrefs();
  return (
    <html lang={locale} className={manrope.variable}>
      <body className="min-h-full antialiased">
        {/* Interactive point grid, behind everything, on every page. */}
        <DotGrid />
        <PrefsProvider locale={locale} currency={currency} rates={rates}>
          {children}
        </PrefsProvider>
      </body>
    </html>
  );
}
