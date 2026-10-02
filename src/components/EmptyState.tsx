import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-zinc-100 text-zinc-600">
        <Icon size={24} />
      </span>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function SoonButton({ children }: { children: ReactNode }) {
  return (
    <span
      title="Coming soon"
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-500"
    >
      {children}
      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">SOON</span>
    </span>
  )
}
