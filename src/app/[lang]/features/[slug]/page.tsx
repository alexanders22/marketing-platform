import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLang } from "@/components/landing/i18n";
import { FEATURES } from "@/components/landing/site";
import { FeatureView, featureMetadata } from "../../../features/[slug]/page";

export const dynamicParams = false;
export const generateStaticParams = () => ["ka", "ru"].flatMap((lang) => FEATURES.map((f) => ({ lang, slug: f.slug })));

export async function generateMetadata({ params }: PageProps<"/[lang]/features/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  return isLang(lang) ? featureMetadata(lang, slug) : {};
}

export default async function LocalizedFeature({ params }: PageProps<"/[lang]/features/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang) || lang === "en") notFound();
  return <FeatureView lang={lang} slug={slug} />;
}
