// Holidays and marketing moments: shown in the Planner, given to the
// strategist, and announced 10 days ahead. Shared by client and server.

export type Holiday = { date: string; name: string; kind: 'public' | 'moment'; idea: string }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

// Orthodox Easter (Julian computus, shifted to the Gregorian calendar).
export function orthodoxEaster(year: number) {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  const julian = Date.UTC(year, month - 1, day)
  return new Date(julian + 13 * 86_400_000) // valid 1900–2099
}

const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
}

const lastWeekday = (y: number, m: number, weekday: number) => {
  const last = new Date(Date.UTC(y, m, 0))
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)
}

export function holidaysOf(year: number): Holiday[] {
  const easter = orthodoxEaster(year)
  const e = (shift: number) => new Date(easter.getTime() + shift * 86_400_000).toISOString().slice(0, 10)
  const bf = nthWeekday(year, 11, 5, 4) // 4th Friday of November
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: 'New Year', kind: 'public', idea: 'Thank customers for the year, share plans and a New Year offer.' },
    { date: ymd(year, 1, 7), name: 'Orthodox Christmas', kind: 'public', idea: 'Warm Christmas greeting; family and tradition.' },
    { date: ymd(year, 1, 19), name: 'Epiphany (Natlisgeba)', kind: 'public', idea: 'A short greeting.' },
    { date: ymd(year, 2, 14), name: "Valentine's Day", kind: 'moment', idea: 'Gifts, couples offers, love for customers.' },
    { date: ymd(year, 3, 3), name: "Mother's Day (Georgia)", kind: 'public', idea: 'Honour mothers; gift ideas.' },
    { date: ymd(year, 3, 8), name: "International Women's Day", kind: 'public', idea: 'Celebrate women — team, customers; gift offers.' },
    { date: e(-2), name: 'Orthodox Good Friday', kind: 'public', idea: 'Quiet, respectful message.' },
    { date: e(0), name: 'Orthodox Easter', kind: 'public', idea: 'Easter greeting; family traditions; holiday hours.' },
    { date: e(1), name: 'Easter Monday', kind: 'public', idea: 'Holiday opening hours.' },
    { date: ymd(year, 4, 9), name: 'Day of National Unity', kind: 'public', idea: 'Respectful remembrance post.' },
    { date: ymd(year, 5, 9), name: 'Victory Day', kind: 'public', idea: 'Respectful remembrance post.' },
    { date: ymd(year, 5, 12), name: 'St Andrew Day', kind: 'public', idea: 'A short greeting.' },
    { date: ymd(year, 5, 26), name: 'Independence Day (Georgia)', kind: 'public', idea: 'Pride in Georgia; local roots.' },
    { date: ymd(year, 6, 1), name: "Children's Day", kind: 'moment', idea: 'Family offers, kids activities.' },
    { date: ymd(year, 8, 28), name: 'Mariamoba', kind: 'public', idea: 'Greeting to all Marias; holiday hours.' },
    { date: ymd(year, 9, 15), name: 'Back to school', kind: 'moment', idea: 'School season offers for families.' },
    { date: ymd(year, 10, 14), name: 'Svetitskhovloba / Mtskhetoba', kind: 'public', idea: 'A short greeting.' },
    { date: ymd(year, 10, lastWeekday(year, 10, 6)), name: 'Tbilisoba', kind: 'moment', idea: 'Celebrate Tbilisi: city pride, local offers, events.' },
    { date: ymd(year, 11, bf), name: 'Black Friday', kind: 'moment', idea: 'Biggest sale of the year — announce early, countdown posts.' },
    { date: ymd(year, 11, bf + 3), name: 'Cyber Monday', kind: 'moment', idea: 'Online-only deals.' },
    { date: ymd(year, 11, 23), name: 'Giorgoba', kind: 'public', idea: 'Greeting to all Giorgis; holiday hours.' },
    { date: ymd(year, 12, 20), name: 'New Year shopping', kind: 'moment', idea: 'Gift guides, last delivery dates, holiday bundles.' },
    { date: ymd(year, 12, 31), name: "New Year's Eve", kind: 'moment', idea: 'Countdown, wishes, opening hours.' },
  ]
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

// Holidays between two days (YYYY-MM-DD, inclusive).
export function holidaysBetween(from: string, to: string): Holiday[] {
  const y0 = Number(from.slice(0, 4))
  const y1 = Number(to.slice(0, 4))
  const out: Holiday[] = []
  for (let y = y0; y <= y1; y++) out.push(...holidaysOf(y).filter((h) => h.date >= from && h.date <= to))
  return out
}
