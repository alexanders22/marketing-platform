import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { alternates } from "@/components/landing/i18n";

// Prices come from Admin → Pricing: refreshed every 10 minutes.
export const revalidate = 600;

export const metadata: Metadata = { alternates: alternates("/") };

export default function Home() {
  return <Landing lang="en" />;
}
