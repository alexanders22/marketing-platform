import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { BrandSettings } from './BrandSettings'

export const metadata: Metadata = { title: 'Brand settings — Khma' }

export default async function BrandPage() {
  const { workspace, brand } = await requireContext()
  return (
    <BrandSettings
      initial={{
        name: workspace.name,
        website: brand?.website ?? '',
        description: brand?.description ?? '',
        logoUrl: brand?.logoUrl ?? '',
        colors: brand?.colors ?? [],
        socialLinks: brand?.socialLinks ?? [],
        voice: brand?.voice ?? '',
        audience: brand?.audience ?? '',
        fonts: brand?.fonts.join(', ') ?? '',
      }}
    />
  )
}
