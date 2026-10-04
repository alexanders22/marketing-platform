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
} from "lucide-react";
import { FaLinkedinIn } from "react-icons/fa6";
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

export const FEATURES: Feature[] = [
  {
    slug: "publish",
    icon: CalendarDays,
    tint: "bg-emerald-400/15 text-emerald-300",
    glow: "from-emerald-500/20",
    title: "Planner",
    short: "Plan every post for every network on one calendar.",
    headline: "One calendar for everything you post",
    intro:
      "Write once, adapt per network and see the whole month at a glance. Drafts, scheduled posts, campaigns and blog articles live side by side in month and list views.",
    points: [
      { title: "Month and list views", body: "Drag your eye across the month, or work through a clean list of what is next." },
      { title: "Per-network channels", body: "Pick where each post goes; captions and hashtags are checked against each network's limits." },
      { title: "Your time zone", body: "Every date is planned in your own zone, daylight-saving switches included." },
      { title: "Direct publishing — rolling out", body: "Network connectors arrive one by one. Until then, plan and copy with one click." },
    ],
    status: "live",
  },
  {
    slug: "campaigns",
    icon: Megaphone,
    tint: "bg-sky-400/15 text-sky-300",
    glow: "from-sky-500/20",
    title: "Campaigns",
    short: "A run of social posts or a series of articles from one brief.",
    headline: "A whole campaign from one brief",
    intro:
      "Describe the goal, pick the dates and how often to post. Loudpilot writes every post in your brand voice and lays it out on the calendar — ready to review, rewrite or schedule.",
    points: [
      { title: "Social campaigns", body: "Up to 8 weeks, 1–7 posts a week, each with its own caption, hashtags and date." },
      { title: "Blog series", body: "An outline for every article first; write the full article only when you need it." },
      { title: "Rewrite any post", body: "Not quite right? Rewrite a single post without touching the rest." },
      { title: "Your brand kit inside", body: "Voice, audience and language come from your brand — no prompt engineering." },
    ],
    status: "live",
  },
  {
    slug: "design",
    icon: Palette,
    tint: "bg-indigo-400/15 text-indigo-300",
    glow: "from-indigo-500/20",
    title: "Design Studio",
    short: "The built-in editor behind every visual you post.",
    headline: "Design on-brand visuals in minutes",
    intro:
      "Start from a template sized for each network, drop in your colours and logo, and export straight into a post. No designer queue, no file juggling.",
    points: [
      { title: "Templates per format", body: "Square, portrait, story and landscape — resize a design without starting over." },
      { title: "Text, shapes and images", body: "Layers, alignment, undo and autosave, right in the browser." },
      { title: "Your colours by default", body: "The palette comes from your brand kit." },
      { title: "Use in a post", body: "Export to PNG and attach it to a post in one click." },
    ],
    status: "live",
  },
  {
    slug: "bio",
    icon: Link2,
    tint: "bg-fuchsia-400/15 text-fuchsia-300",
    glow: "from-fuchsia-500/20",
    title: "Bio pages",
    short: "One link-in-bio page for every profile.",
    headline: "A link-in-bio page that looks like your brand",
    intro:
      "Put every link that matters behind a single address. Build the page in minutes, publish it on your own Loudpilot link and see which links people actually click.",
    points: [
      { title: "Links, headings and socials", body: "Arrange blocks in any order and style them with your colours." },
      { title: "Click tracking", body: "Views and clicks per link, without third-party trackers." },
      { title: "Your own address", body: "Pick a short, memorable slug for every profile." },
      { title: "Live preview", body: "See the phone view while you edit." },
    ],
    status: "new",
  },
  {
    slug: "inbox",
    icon: Inbox,
    tint: "bg-orange-400/15 text-orange-300",
    glow: "from-orange-500/20",
    title: "Social Inbox",
    short: "Every DM, comment and mention in one place.",
    headline: "Every conversation in one inbox",
    intro:
      "Direct messages, comments and mentions from all your profiles in one list — with on-brand reply suggestions so nobody waits.",
    points: [
      { title: "One list for all profiles", body: "DMs, comments and mentions, filtered by open, resolved or assigned to you." },
      { title: "AI reply drafts", body: "Suggested answers in your brand voice; you approve every reply." },
      { title: "Leads to your CRM", body: "Turn a conversation into a lead in the product your team already uses." },
    ],
    status: "soon",
  },
  {
    slug: "workflows",
    icon: Workflow,
    tint: "bg-rose-400/15 text-rose-300",
    glow: "from-rose-500/20",
    title: "Workflows",
    short: "Automate posting and replies visually.",
    headline: "Marketing that runs itself",
    intro:
      "Connect a trigger to an action: a new product on your site becomes a scheduled post, a new listing becomes a campaign, a new comment gets a drafted reply.",
    points: [
      { title: "Triggers", body: "New product, new lead, a date, or an event from a partner app." },
      { title: "AI steps", body: "Write a caption, generate a visual or pick the best time." },
      { title: "Actions", body: "Create a post, start a campaign or notify your team." },
    ],
    status: "soon",
  },
  {
    slug: "api",
    icon: Code2,
    tint: "bg-zinc-400/15 text-zinc-200",
    glow: "from-zinc-400/15",
    title: "Partner API",
    short: "Give every customer of your product a marketing module.",
    headline: "Loudpilot inside the product you already run",
    intro:
      "Connect your SaaS, CRM or marketplace once. Each of your companies, agents or sellers gets an isolated workspace with its own brand, content and credits — you keep your UI.",
    points: [
      { title: "Workspace per customer", body: "Created by your external id, fully isolated from every other customer." },
      { title: "Single or reseller mode", body: "One company, or many profiles under your platform." },
      { title: "Credits and revenue share", body: "Customers pay Loudpilot for credits; you earn a share of every purchase." },
      { title: "Hashed keys", body: "API keys are shown once and stored only as a hash." },
    ],
    status: "live",
  },
  {
    slug: "ads",
    icon: BarChart3,
    tint: "bg-amber-400/15 text-amber-300",
    glow: "from-amber-500/20",
    title: "Ads & analytics",
    short: "Paid campaigns and results with next-step advice.",
    headline: "Ads and results that explain themselves",
    intro:
      "Create Meta and TikTok campaigns next to your organic content, follow spend, leads and cost per lead, and get plain-language advice on what to do next.",
    points: [
      { title: "Paid campaigns", body: "Budgets, audiences and creatives in the same place as your posts." },
      { title: "One set of numbers", body: "Reach, engagement, spend, CPL and ROAS across every account." },
      { title: "Recommendations", body: "What to stop, what to scale and why — in plain words." },
    ],
    status: "soon",
  },
];

export const featureHref = (slug: string) => `/features/${slug}`;

export const INTEGRATIONS: { icon: Icon; name: string; body: string }[] = [
  { icon: SiFacebook, name: "Facebook", body: "Posts for your business pages." },
  { icon: SiInstagram, name: "Instagram", body: "Feed posts, Reels and Stories." },
  { icon: SiTiktok, name: "TikTok", body: "Short-form video with captions." },
  { icon: FaLinkedinIn, name: "LinkedIn", body: "Profiles and company pages." },
  { icon: SiX, name: "X (Twitter)", body: "Posts and threads." },
  { icon: SiThreads, name: "Threads", body: "Text-first updates." },
  { icon: SiYoutube, name: "YouTube Shorts", body: "Vertical video." },
  { icon: SiPinterest, name: "Pinterest", body: "Pins for the right boards." },
  { icon: SiBluesky, name: "Bluesky", body: "The open social network." },
  { icon: SiTelegram, name: "Telegram", body: "Channels and groups." },
  { icon: SiWhatsapp, name: "WhatsApp", body: "Channel updates." },
  { icon: SiGoogle, name: "Google Business", body: "Updates on your business profile." },
  { icon: SiDiscord, name: "Discord", body: "Server announcements." },
  { icon: SiMastodon, name: "Mastodon", body: "Any server on the fediverse." },
  { icon: SiWordpress, name: "WordPress", body: "Blog articles on your own site." },
  { icon: SiWoocommerce, name: "WooCommerce", body: "New products become posts." },
  { icon: SiMeta, name: "Meta Ads", body: "Paid campaigns and lead forms." },
  { icon: SiGoogleads, name: "Google Ads", body: "Search and display campaigns." },
];

export const RESOURCES: { title: string; links: { icon: Icon; label: string; body: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { icon: Tags, label: "Pricing", body: "Plans, credits and the free trial", href: "/#pricing" },
      { icon: Code2, label: "Partner API", body: "Workspaces, credits and revenue share", href: featureHref("api") },
      { icon: BookOpen, label: "API documentation", body: "Endpoints, connect links and webhooks", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { icon: Handshake, label: "Become a partner", body: "Bring Loudpilot to your customers", href: CONTACT },
      { icon: Mail, label: "Contact sales", body: "A demo for your team", href: CONTACT },
      { icon: LifeBuoy, label: "Support", body: "Questions about your account", href: SUPPORT },
    ],
  },
];
