import type { Metadata } from "next";
import { Inter, Noto_Sans_Georgian } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

// Inter has no Georgian letters.
const georgian = Noto_Sans_Georgian({
  variable: "--font-georgian",
  subsets: ["georgian"],
});

export const metadata: Metadata = {
  // Absolute links for hreflang, canonical and social cards.
  metadataBase: new URL(process.env.APP_URL || "https://loudpilot.app"),
  title: "Loudpilot — AI marketing: content, ads and analytics",
  description:
    "Loudpilot writes, designs, schedules and advertises for your brand — then reads the results and tells you what to do next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${georgian.variable} h-full scroll-smooth antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
