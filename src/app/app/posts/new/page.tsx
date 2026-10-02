import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { PostEditor } from '../PostEditor'

export const metadata: Metadata = { title: 'New post — Khma' }

export default async function NewPostPage({ searchParams }: PageProps<'/app/posts/new'>) {
  const { workspace, brand } = await requireContext()
  const { date } = await searchParams
  // ?date=YYYY-MM-DD from a Planner day cell → 10:00 that day, in the user's own time zone.
  const defaultWhen = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T10:00` : undefined
  return (
    <PostEditor
      brand={{ name: workspace.name, logoUrl: brand?.logoUrl ?? null }}
      initial={{ content: '', hashtags: [], media: [], channels: [], scheduledAt: null }}
      defaultWhen={defaultWhen}
    />
  )
}
