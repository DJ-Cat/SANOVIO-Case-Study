import localFont from "next/font/local";

/**
 * Manrope, the face sanovio.de is set in, self-hosted and bundled at build
 * time: no font CDN at runtime, nothing to break offline. One variable file
 * covers every weight the platform uses, from body text to headings.
 */
export const manrope = localFont({
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
  // The Latin subset carries German and French accents and umlauts; rarer
  // letters fall back to the system face.
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
});
