'use client'

import type { ComponentType } from 'react'
import { FaLinkedinIn } from 'react-icons/fa6'
import { SiFacebook, SiInstagram, SiPinterest, SiTelegram, SiThreads, SiTiktok, SiX, SiYoutube } from 'react-icons/si'

export type Network = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN' | 'YOUTUBE' | 'TELEGRAM' | 'X' | 'THREADS' | 'PINTEREST'

export const NETWORKS: { id: Network; name: string; icon: ComponentType<{ size?: number; color?: string }>; color: string; limit: number }[] = [
  { id: 'FACEBOOK', name: 'Facebook', icon: SiFacebook, color: '#1877F2', limit: 63206 },
  { id: 'INSTAGRAM', name: 'Instagram', icon: SiInstagram, color: '#E4405F', limit: 2200 },
  { id: 'LINKEDIN', name: 'LinkedIn', icon: FaLinkedinIn, color: '#0A66C2', limit: 3000 },
  { id: 'X', name: 'X', icon: SiX, color: '#000000', limit: 280 },
  { id: 'THREADS', name: 'Threads', icon: SiThreads, color: '#000000', limit: 500 },
  { id: 'TIKTOK', name: 'TikTok', icon: SiTiktok, color: '#000000', limit: 2200 },
  { id: 'TELEGRAM', name: 'Telegram', icon: SiTelegram, color: '#26A5E4', limit: 4096 },
  { id: 'PINTEREST', name: 'Pinterest', icon: SiPinterest, color: '#BD081C', limit: 500 },
  { id: 'YOUTUBE', name: 'YouTube', icon: SiYoutube, color: '#FF0000', limit: 5000 },
]

export function ChannelPicker({ value, onChange }: { value: Network[]; onChange: (v: Network[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {NETWORKS.map((n) => {
        const on = value.includes(n.id)
        return (
          <button
            key={n.id}
            type="button"
            title={n.name}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== n.id) : [...value, n.id])}
            className={`grid h-10 w-10 place-items-center rounded-xl border transition ${
              on ? 'border-zinc-900 bg-white shadow-sm' : 'border-zinc-200 bg-white opacity-50 grayscale hover:opacity-80'
            }`}
          >
            <n.icon size={18} color={n.color} />
          </button>
        )
      })}
    </div>
  )
}

export function ChannelIcons({ value, size = 14 }: { value: string[]; size?: number }) {
  return (
    <span className="inline-flex gap-1">
      {NETWORKS.filter((n) => value.includes(n.id)).map((n) => (
        <n.icon key={n.id} size={size} color={n.color} />
      ))}
    </span>
  )
}
