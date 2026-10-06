'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { runTrackingCheck } from '@/lib/tracking'

export async function checkTracking(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  await runTrackingCheck(workspace.id)
  revalidatePath('/app/website/tracking')
  return {}
}
