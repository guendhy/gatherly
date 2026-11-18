import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Gatherly — Event Moments", template: "%s · Gatherly" },
  description: "Capture moments. Share memories. Guests scan a QR code, snap photos, and everything lands in the host's Google Drive.",
  applicationName: "Gatherly",
  appleWebApp: { capable: true, title: "Gatherly", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
