import type { Metadata } from 'next'
import { BlogEditor } from '../BlogEditor'

export const metadata: Metadata = { title: 'New article — Khma' }

export default function NewBlogPage() {
  return <BlogEditor initial={{ title: '', content: '', outline: null, keywords: [], cover: null, scheduledAt: null }} />
}
