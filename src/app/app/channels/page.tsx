import type { Metadata } from 'next'
import { FaLinkedinIn } from 'react-icons/fa6'
import { SiFacebook, SiGoogleads, SiInstagram, SiPinterest, SiTelegram, SiThreads, SiTiktok, SiX, SiYoutube } from 'react-icons/si'
import { PageHeader } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Channels — Khma' }

const CHANNELS = [
  { name: 'Facebook Page', icon: SiFacebook, color: '#1877F2', note: 'Posts, comments, Lead Ads' },
  { name: 'Instagram Business', icon: SiInstagram, color: '#E4405F', note: 'Posts, reels, stories, DMs' },
  { name: 'Meta Ads account', icon: SiFacebook, color: '#0866FF', note: 'Campaigns and daily results' },
  { name: 'TikTok', icon: SiTiktok, color: '#000000', note: 'Videos and TikTok Ads' },
  { name: 'LinkedIn Page', icon: FaLinkedinIn, color: '#0A66C2', note: 'Company page posts' },
  { name: 'YouTube', icon: SiYoutube, color: '#FF0000', note: 'Shorts and videos' },
  { name: 'X', icon: SiX, color: '#000000', note: 'Posts' },
  { name: 'Threads', icon: SiThreads, color: '#000000', note: 'Posts' },
  { name: 'Telegram channel', icon: SiTelegram, color: '#26A5E4', note: 'Channel posts' },
  { name: 'Pinterest', icon: SiPinterest, color: '#BD081C', note: 'Pins' },
  { name: 'Google Ads', icon: SiGoogleads, color: '#4285F4', note: 'Search and display campaigns' },
]

export default function ChannelsPage() {
  return (
    <>
      <PageHeader
        title="Channels"
        sub="Connect the pages and ad accounts Khma publishes to and reads results from."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.name} className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-50 ring-1 ring-zinc-200">
              <c.icon size={20} color={c.color} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-sm text-zinc-500">{c.note}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">Soon</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-zinc-500">
        Connections go live as each network approves the Khma app (Meta first).
      </p>
    </>
  )
}
