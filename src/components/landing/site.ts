import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Code2,
  Inbox,
  LifeBuoy,
  Link2,
  Megaphone,
  Palette,
  Handshake,
  Tags,
  Workflow,
  Mail,
  Clapperboard,
} from "lucide-react";
import { FaLinkedinIn } from "react-icons/fa6";
import { COPY, localePath, type Lang } from "./i18n";
import {
  SiBluesky,
  SiDiscord,
  SiFacebook,
  SiGoogle,
  SiGoogleads,
  SiInstagram,
  SiMastodon,
  SiMeta,
  SiPinterest,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiWoocommerce,
  SiWordpress,
  SiX,
  SiYoutube,
} from "react-icons/si";

export type Icon = ComponentType<{ size?: number; className?: string }>;

// Sign in / sign up live on the terminal host when there is one.
const TERMINAL = process.env.NEXT_PUBLIC_TERMINAL_URL ?? "";
export const LOGIN = `${TERMINAL}/login`;
export const SIGNUP = `${TERMINAL}/signup`;

// Sales / partnership enquiries.
export const CONTACT = "mailto:info@loudpilot.app?subject=Loudpilot%20demo";
export const SUPPORT = "mailto:info@loudpilot.app?subject=Loudpilot%20support";

export type Feature = {
  slug: string;
  icon: Icon;
  // Tailwind classes for the icon tile and the card glow.
  tint: string;
  glow: string;
  title: string;
  short: string;
  headline: string;
  intro: string;
  points: { title: string; body: string }[];
  // "soon" = on the roadmap, not usable yet. Shown as a badge everywhere.
  status: "live" | "new" | "soon";
};

// Look and status per feature; the words come from the landing copy.
const FEATURE_BASE: Pick<Feature, "slug" | "icon" | "tint" | "glow" | "status">[] = [
  { slug: "publish", icon: CalendarDays, tint: "bg-emerald-400/15 text-emerald-300", glow: "from-emerald-500/20", status: "live" },
  { slug: "campaigns", icon: Megaphone, tint: "bg-sky-400/15 text-sky-300", glow: "from-sky-500/20", status: "live" },
  { slug: "design", icon: Palette, tint: "bg-indigo-400/15 text-indigo-300", glow: "from-indigo-500/20", status: "live" },
  { slug: "video", icon: Clapperboard, tint: "bg-pink-400/15 text-pink-300", glow: "from-pink-500/20", status: "new" },
  { slug: "ads", icon: BarChart3, tint: "bg-amber-400/15 text-amber-300", glow: "from-amber-500/20", status: "new" },
  { slug: "inbox", icon: Inbox, tint: "bg-orange-400/15 text-orange-300", glow: "from-orange-500/20", status: "new" },
  { slug: "bio", icon: Link2, tint: "bg-fuchsia-400/15 text-fuchsia-300", glow: "from-fuchsia-500/20", status: "live" },
  { slug: "api", icon: Code2, tint: "bg-zinc-400/15 text-zinc-200", glow: "from-zinc-400/15", status: "live" },
  { slug: "workflows", icon: Workflow, tint: "bg-rose-400/15 text-rose-300", glow: "from-rose-500/20", status: "soon" },
];

export const featuresFor = (lang: Lang): Feature[] => FEATURE_BASE.map((f) => ({ ...f, ...COPY[lang].features[f.slug] }));

// English, for code that doesn't care about language (slugs, sitemaps).
export const FEATURES = featuresFor("en");

export const featureHref = (slug: string, lang: Lang = "en") => localePath(lang, `/features/${slug}`);

const INTEGRATION_LIST: { icon: Icon; name: string }[] = [
  { icon: SiFacebook, name: "Facebook" },
  { icon: SiInstagram, name: "Instagram" },
  { icon: SiTiktok, name: "TikTok" },
  { icon: FaLinkedinIn, name: "LinkedIn" },
  { icon: SiX, name: "X (Twitter)" },
  { icon: SiThreads, name: "Threads" },
  { icon: SiYoutube, name: "YouTube Shorts" },
  { icon: SiPinterest, name: "Pinterest" },
  { icon: SiBluesky, name: "Bluesky" },
  { icon: SiTelegram, name: "Telegram" },
  { icon: SiWhatsapp, name: "WhatsApp" },
  { icon: SiGoogle, name: "Google Business" },
  { icon: SiDiscord, name: "Discord" },
  { icon: SiMastodon, name: "Mastodon" },
  { icon: SiWordpress, name: "WordPress" },
  { icon: SiWoocommerce, name: "WooCommerce" },
  { icon: SiMeta, name: "Meta Ads" },
  { icon: SiGoogleads, name: "Google Ads" },
];

export const integrationsFor = (lang: Lang) => INTEGRATION_LIST.map((n) => ({ ...n, body: COPY[lang].integrations[n.name] ?? "" }));

export function resourcesFor(lang: Lang): { title: string; links: { icon: Icon; label: string; body: string; href: string }[] }[] {
  const m = COPY[lang].menu;
  return [
    {
      title: m.product,
      links: [
        { icon: Tags, ...m.resources.pricing, href: localePath(lang, "/#pricing") },
        { icon: Code2, ...m.resources.api, href: featureHref("api", lang) },
        { icon: BookOpen, ...m.resources.docs, href: "/docs" },
      ],
    },
    {
      title: m.company,
      links: [
        { icon: Handshake, ...m.resources.partner, href: CONTACT },
        { icon: Mail, ...m.resources.sales, href: CONTACT },
        { icon: LifeBuoy, ...m.resources.support, href: SUPPORT },
      ],
    },
  ];
}
