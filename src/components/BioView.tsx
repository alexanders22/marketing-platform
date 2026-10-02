import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { BioBlock, BioTheme } from '@/lib/bio'
import { SocialIcon } from './social'

// Renders a bio page. Used by the public /b/[slug] route and by the live
// preview in the editor (`linkHref` decides where buttons point).
export function BioView({
  title,
  bio,
  avatar,
  theme,
  blocks,
  linkHref,
  preview = false,
}: {
  title: string
  bio: string
  avatar: string | null
  theme: BioTheme
  blocks: BioBlock[]
  linkHref: (b: Extract<BioBlock, { type: 'link' }>) => string
  // Inside the editor the page already has its own <h1>.
  preview?: boolean
}) {
  const Title = preview ? 'p' : 'h1'
  const radius = theme.rounded === 'full' ? 999 : theme.rounded === 'md' ? 12 : 0
  const btn: CSSProperties =
    theme.buttonStyle === 'filled'
      ? { background: theme.button, color: theme.buttonText, borderRadius: radius }
      : theme.buttonStyle === 'outline'
        ? { border: `2px solid ${theme.button}`, color: theme.button, borderRadius: radius }
        : { background: `${theme.button}26`, color: theme.text, borderRadius: radius }

  return (
    <div className="min-h-full px-5 py-10 [overflow-wrap:anywhere]" style={{ background: theme.background, color: theme.text }}>
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-24 w-24 rounded-full bg-white object-cover shadow-md" />
        ) : (
          <span className="grid h-24 w-24 place-items-center rounded-full bg-white/20 text-3xl font-bold">{title.slice(0, 1)}</span>
        )}
        <Title className="mt-4 text-xl font-bold">{title}</Title>
        {bio && <p className="mt-2 text-sm whitespace-pre-wrap opacity-85">{bio}</p>}

        <div className="mt-8 w-full space-y-3">
          {blocks
            .filter((b) => b.enabled)
            .map((b) => {
              if (b.type === 'link')
                return (
                  <a
                    key={b.id}
                    href={linkHref(b)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block w-full px-5 py-3.5 text-[15px] font-semibold transition hover:scale-[1.02]"
                    style={btn}
                  >
                    {b.title}
                  </a>
                )
              if (b.type === 'heading')
                return (
                  <h2 key={b.id} className="pt-3 text-base font-bold">
                    {b.text}
                  </h2>
                )
              if (b.type === 'text')
                return (
                  <p key={b.id} className="text-sm whitespace-pre-wrap opacity-85">
                    {b.text}
                  </p>
                )
              return (
                <div key={b.id} className="flex flex-wrap justify-center gap-3 pt-2">
                  {b.links.map((l) => (
                    <a
                      key={l}
                      href={l}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm"
                      aria-label={l}
                    >
                      <SocialIcon url={l} size={20} />
                    </a>
                  ))}
                </div>
              )
            })}
        </div>
        <Link href="/" className="mt-12 text-xs opacity-60 hover:opacity-100">
          Made with Khma
        </Link>
      </div>
    </div>
  )
}
