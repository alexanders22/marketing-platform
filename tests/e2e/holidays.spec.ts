import { expect, test } from '@playwright/test'
import { holidaysBetween, holidaysOf, orthodoxEaster } from '../../src/lib/holidays'

test('Orthodox Easter dates', () => {
  expect(orthodoxEaster(2025).toISOString().slice(0, 10)).toBe('2025-04-20')
  expect(orthodoxEaster(2026).toISOString().slice(0, 10)).toBe('2026-04-12')
  expect(orthodoxEaster(2027).toISOString().slice(0, 10)).toBe('2027-05-02')
})

test('moving days and ranges', () => {
  const y2026 = holidaysOf(2026)
  expect(y2026.find((h) => h.name === 'Black Friday')?.date).toBe('2026-11-27')
  expect(y2026.find((h) => h.name === 'Tbilisoba')?.date).toBe('2026-10-31')
  const range = holidaysBetween('2026-12-25', '2027-01-10').map((h) => h.name)
  expect(range).toEqual(["New Year's Eve", 'New Year', 'Orthodox Christmas'])
})
