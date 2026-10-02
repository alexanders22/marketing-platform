import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { BrandForm } from './BrandForm'

export const metadata: Metadata = { title: 'Brand kit — Khma' }

export default async function BrandPage() {
  const { workspace } = await requireContext()
  const brand = await prisma.brandKit.findUnique({ where: { workspaceId: workspace.id } })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Brand kit</h1>
        <p className="mt-1 text-zinc-400">
          Tell Khma who {workspace.name} is. Every post, image and ad the AI creates follows this.
        </p>
      </div>
      <BrandForm
        initial={{
          website: brand?.website ?? '',
          description: brand?.description ?? '',
          voice: brand?.voice ?? '',
          audience: brand?.audience ?? '',
          colors: brand?.colors ?? [],
          fonts: brand?.fonts.join(', ') ?? '',
        }}
      />
    </div>
  )
}
