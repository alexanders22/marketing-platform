import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { card, fmtDateTime } from '../shared'

const HREF: Record<string, string> = { account: '/admin/companies/', user: '/admin/users/' }

export default async function AdminActivity() {
  const logs = await prisma.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Admin activity</h1>
      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-5 py-3 font-medium">Who</th>
              <th className="px-5 py-3 font-medium">What</th>
              <th className="px-5 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-2.5 whitespace-nowrap text-zinc-500">{fmtDateTime(l.createdAt)}</td>
                <td className="px-5 py-2.5">{l.adminEmail}</td>
                <td className="px-5 py-2.5">
                  {HREF[l.targetType] ? (
                    <Link href={HREF[l.targetType] + l.targetId} className="font-medium hover:underline">
                      {l.action}
                    </Link>
                  ) : (
                    <span className="font-medium">{l.action}</span>
                  )}
                </td>
                <td className="max-w-md truncate px-5 py-2.5 text-xs text-zinc-500">{l.details ? JSON.stringify(l.details) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="px-5 py-10 text-center text-sm text-zinc-500">Nothing yet.</p>}
      </section>
    </div>
  )
}
