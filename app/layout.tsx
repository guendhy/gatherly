import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Gatherly | Capture the moment", description: "Scan, snap and share every beautiful event moment." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f9f7f1" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
