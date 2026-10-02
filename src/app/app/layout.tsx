import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { Sidebar } from './Sidebar'

export const metadata: Metadata = { title: 'Khma' }

export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const { user, workspace } = await requireContext()
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar workspace={workspace.name} user={{ name: user.name, email: user.email }} />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
