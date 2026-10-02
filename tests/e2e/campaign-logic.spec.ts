import { expect, test } from '@playwright/test'
import { BATCH, chunks, pairWithDates, slots, startsInPast } from '../../src/lib/campaign-plan'
import { dayIn } from '../../src/lib/time'

// Pure scheduling logic used by createSocialCampaign / createBlogCampaign.
// No browser, no AI.

const localParts = (d: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
const dayIndex = (iso: string, start: string) => Math.round((Date.parse(iso) - Date.parse(start)) / 86_400_000)

test.describe('campaign slots() date math', () => {
  for (let perWeek = 1; perWeek <= 7; perWeek++) {
    test(`posts-per-week ${perWeek}: one slot per distinct day inside each week, chosen local time`, () => {
      const tz = 'Asia/Tbilisi'
      const weeks = 3
      const dates = slots('2026-10-05', '09:30', tz, weeks, perWeek)
      expect(dates).toHaveLength(weeks * perWeek)
      const days = dates.map((d) => dayIndex(dayIn(d, tz), '2026-10-05'))
      for (let w = 0; w < weeks; w++) {
        const inWeek = days.slice(w * perWeek, (w + 1) * perWeek)
        expect(new Set(inWeek).size).toBe(perWeek)
        for (const x of inWeek) expect(x >= w * 7 && x <= w * 7 + 6).toBe(true)
      }
      expect([...days].sort((a, b) => a - b)).toEqual(days)
      for (const d of dates) expect(localParts(d, tz).time).toBe('09:30')
    })
  }

  test('documented spread for 1..7 posts/week (day offsets inside a week)', () => {
    const spread = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [n, slots('2026-10-05', '10:00', 'UTC', 1, n).map((d) => dayIndex(dayIn(d, 'UTC'), '2026-10-05'))]),
    )
    expect(spread).toEqual({
      1: [0],
      2: [0, 3],
      3: [0, 2, 4],
      4: [0, 1, 3, 5],
      5: [0, 1, 2, 4, 5],
      6: [0, 1, 2, 3, 4, 5],
      7: [0, 1, 2, 3, 4, 5, 6],
    })
  })

  test(`8 weeks x 7 = 56 slots in batches of ${BATCH}, last slot day 55`, () => {
    const dates = slots('2026-10-05', '10:00', 'Asia/Tbilisi', 8, 7)
    expect(dates).toHaveLength(56)
    expect(chunks(dates).map((c) => c.length)).toEqual(Array(56 / BATCH).fill(BATCH))
    expect(dayIndex(dayIn(dates[55], 'Asia/Tbilisi'), '2026-10-05')).toBe(55)
  })

  test('local time just after midnight in UTC+4 keeps the local calendar day', () => {
    const [d] = slots('2026-10-05', '00:30', 'Asia/Tbilisi', 1, 1)
    expect(d.toISOString()).toBe('2026-10-04T20:30:00.000Z')
    expect(dayIn(d, 'Asia/Tbilisi')).toBe('2026-10-05')
  })

  test('blog series limit: count 5 at 3/week fills 2 weeks and stops at 5', () => {
    const dates = slots('2026-10-05', '10:00', 'UTC', Math.ceil(5 / 3), 3, 5)
    expect(dates.map((d) => dayIndex(dayIn(d, 'UTC'), '2026-10-05'))).toEqual([0, 2, 4, 7, 9])
  })

  test('DST: Berlin user keeps 10:00 local after the switch to CET', () => {
    const dates = slots('2026-10-22', '10:00', 'Europe/Berlin', 1, 7) // DST ends 2026-10-25
    expect(dates.map((d) => localParts(d, 'Europe/Berlin').time)).toEqual(Array(7).fill('10:00'))
  })

  test('start dates before today (in the user zone) are refused', () => {
    const now = new Date('2026-10-05T21:30:00Z') // already Oct 6 in Tbilisi
    expect(startsInPast('2026-10-05', 'Asia/Tbilisi', now)).toBe(true)
    expect(startsInPast('2026-10-06', 'Asia/Tbilisi', now)).toBe(false)
    expect(startsInPast('2026-10-05', 'America/New_York', now)).toBe(false)
  })
})

test.describe('createSocialCampaign batch assembly', () => {
  // Stub AI: returns `short` fewer posts than asked in batch `shortBatch`.
  function assemble(dates: Date[], tz: string, shortBatch: number, short: number) {
    const made: { post: { forDate: string }; date: Date }[] = []
    for (const [i, chunk] of chunks(dates).entries()) {
      const answer = chunk.map((d) => ({ forDate: dayIn(d, tz) }))
      made.push(...pairWithDates(chunk, i === shortBatch ? answer.slice(0, answer.length - short) : answer))
    }
    return made
  }

  test('short AI answer in batch 1 of a 4-week x 7 campaign keeps each post on the date it was written for', () => {
    const tz = 'Asia/Tbilisi'
    const made = assemble(slots('2026-10-05', '10:00', tz, 4, 7), tz, 0, 2)
    expect(made).toHaveLength(26)
    expect(made.filter((m) => m.post.forDate !== dayIn(m.date, tz))).toHaveLength(0)
  })

  test('short AI answer: the last created post is the campaign end', () => {
    const tz = 'Asia/Tbilisi'
    const dates = slots('2026-10-05', '10:00', tz, 1, 3)
    const made = assemble(dates, tz, 0, 1)
    // createSocialCampaign sets endsOn = made[made.length - 1].date
    expect(dayIn(made[made.length - 1].date, tz)).toBe(dayIn(dates[1], tz))
  })
})
