import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HtmlLang } from "@/components/landing/HtmlLang";
import { Landing } from "@/components/landing/Landing";
import { alternates, COPY, isLang } from "@/components/landing/i18n";

// /ka and /ru; English is the root page.
export const dynamicParams = false;
export const generateStaticParams = () => [{ lang: "ka" }, { lang: "ru" }];

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: COPY[lang].meta.title, description: COPY[lang].meta.description, alternates: alternates("/") };
}

export default async function LocalizedHome({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "en") notFound();
  return (
    <>
      <HtmlLang lang={lang} />
      <Landing lang={lang} />
    </>
  );
}
