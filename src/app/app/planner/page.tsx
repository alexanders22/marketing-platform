import type { Metadata } from 'next'
import { Planner } from './Planner'

export const metadata: Metadata = { title: 'Planner — Khma' }

export default function PlannerPage() {
  return <Planner />
}
