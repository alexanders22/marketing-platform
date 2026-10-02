import type { Metadata } from 'next'
import { Link2 } from 'lucide-react'
import { EmptyState, PageHeader, SoonButton } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Bio Pages — Khma' }

export default function BioPage() {
  return (
    <>
      <PageHeader
        title="Bio Pages"
        sub="One link for your profile bio — your offers, contacts and latest posts on a single page."
        action={<SoonButton>New bio page</SoonButton>}
      />
      <EmptyState icon={Link2} title="No bio pages yet">
        Build a link-in-bio page in your brand colours and track every click.
      </EmptyState>
    </>
  )
}
