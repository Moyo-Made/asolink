import type { Metadata, Viewport } from "next";
import { Gloock, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const display = Gloock({ variable: "--font-gloock", subsets: ["latin"], weight: "400" });
const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://asolink.vercel.app"),
  title: { default: "AsoLink: aso ebi, sorted", template: "%s · AsoLink" },
  description:
    "One link for your aso ebi. Guests see the fabric on themselves, pick a size, and order from you on WhatsApp.",
};

export const viewport: Viewport = { themeColor: "#1B2559", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${display.variable} ${sans.variable} antialiased`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
