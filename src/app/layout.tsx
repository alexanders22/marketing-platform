import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Loudpilot — AI marketing: content, ads and analytics",
  description:
    "Loudpilot writes, designs, schedules and advertises for your brand — then reads the results and tells you what to do next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} h-full scroll-smooth antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
