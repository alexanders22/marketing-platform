import type { ComponentType } from 'react'
import { FaLinkedinIn } from 'react-icons/fa6'
import { Link2 } from 'lucide-react'
import {
  SiFacebook,
  SiInstagram,
  SiPinterest,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from 'react-icons/si'

type Icon = ComponentType<{ size?: number; className?: string; color?: string }>

const NETWORKS: { match: RegExp; name: string; icon: Icon; color: string }[] = [
  { match: /facebook\.com|fb\.com/, name: 'Facebook', icon: SiFacebook, color: '#1877F2' },
  { match: /instagram\.com/, name: 'Instagram', icon: SiInstagram, color: '#E4405F' },
  { match: /(^|\.)x\.com|twitter\.com/, name: 'X', icon: SiX, color: '#000000' },
  { match: /linkedin\.com/, name: 'LinkedIn', icon: FaLinkedinIn, color: '#0A66C2' },
  { match: /tiktok\.com/, name: 'TikTok', icon: SiTiktok, color: '#000000' },
  { match: /youtube\.com|youtu\.be/, name: 'YouTube', icon: SiYoutube, color: '#FF0000' },
  { match: /t\.me|telegram\./, name: 'Telegram', icon: SiTelegram, color: '#26A5E4' },
  { match: /pinterest\./, name: 'Pinterest', icon: SiPinterest, color: '#BD081C' },
  { match: /threads\.net/, name: 'Threads', icon: SiThreads, color: '#000000' },
]

export function networkOf(url: string) {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {}
  return NETWORKS.find((n) => n.match.test(host)) ?? { name: 'Link', icon: Link2 as Icon, color: '#71717a' }
}

export function SocialIcon({ url, size = 18 }: { url: string; size?: number }) {
  const n = networkOf(url)
  return <n.icon size={size} color={n.color} />
}
