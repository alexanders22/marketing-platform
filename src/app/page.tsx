import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { alternates } from "@/components/landing/i18n";

export const metadata: Metadata = { alternates: alternates("/") };

export default function Home() {
  return <Landing lang="en" />;
}
