import { redirect } from 'next/navigation'

// Results is now Analytics; old links keep working.
export default async function ResultsPage({ searchParams }: PageProps<'/app/results'>) {
  const q = await searchParams
  redirect(`/app/analytics${typeof q.days === 'string' ? `?days=${encodeURIComponent(q.days)}` : ''}`)
}
