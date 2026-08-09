import { expect, test } from 'vitest'
import { render, groupByDay, type FormatOptions } from './format'
import { normalize, subtract, utcToMinutes, wallToUtc, weekStart, type Slot } from './time'
import { decodeState, encodeState } from './url'

const NY = 'America/New_York'
const options: FormatOptions = {
  tz: NY,
  hour12: true,
  showTz: false,
  relativeDays: false,
  longDates: false,
}

// 2026-08-11 (a Tuesday) 09:00–11:00 and 14:00–15:30 in New York.
const day = Math.floor(Date.UTC(2026, 7, 11) / 86_400_000)
const slots: Slot[] = [
  { s: wallToUtc(day, 9 * 60, NY), e: wallToUtc(day, 11 * 60, NY) },
  { s: wallToUtc(day, 14 * 60, NY), e: wallToUtc(day, 15 * 60 + 30, NY) },
]

test('wall clock round-trips through a timezone', () => {
  expect(utcToMinutes(slots[0].s, day, NY)).toBe(9 * 60)
  expect(new Date(slots[0].s).toISOString()).toBe('2026-08-11T13:00:00.000Z') // EDT = UTC-4
})

test('wallToUtc picks the correct offset across a DST boundary', () => {
  const winter = Math.floor(Date.UTC(2026, 0, 13) / 86_400_000)
  expect(new Date(wallToUtc(winter, 9 * 60, NY)).toISOString()).toBe('2026-01-13T14:00:00.000Z') // EST = UTC-5
})

test('normalize merges overlapping and touching blocks', () => {
  const merged = normalize([
    { s: 0, e: 100 },
    { s: 100, e: 200 },
    { s: 50, e: 80 },
    { s: 400, e: 500 },
  ])
  expect(merged).toEqual([
    { s: 0, e: 200 },
    { s: 400, e: 500 },
  ])
})

test('subtract splits a block when the cut lands inside it', () => {
  expect(subtract([{ s: 0, e: 100 }], { s: 40, e: 60 })).toEqual([
    { s: 0, e: 40 },
    { s: 60, e: 100 },
  ])
})

test('url codec round-trips and stays short', () => {
  const encoded = encodeState(slots, NY)
  expect(decodeState(encoded)).toEqual({ slots: normalize(slots), busy: [], tz: NY })
  expect(encoded.length - NY.length).toBeLessThan(20) // ~3 chars per slot plus the base
})

test('url codec round-trips busy blocks alongside available ones', () => {
  const busy: Slot[] = [{ s: wallToUtc(day, 12 * 60, NY), e: wallToUtc(day, 13 * 60, NY) }]
  expect(decodeState(encodeState(slots, NY, busy))).toEqual({ slots: normalize(slots), busy, tz: NY })
  // Links written before busy blocks existed still decode.
  expect(decodeState(encodeState(slots, NY))?.busy).toEqual([])
})

test('decodeState rejects junk instead of throwing', () => {
  expect(decodeState('not-a-payload')).toBe(null)
  expect(decodeState('')).toBe(null)
})

test('grouping splits a block that crosses midnight in the display zone', () => {
  const overnight: Slot[] = [{ s: wallToUtc(day, 23 * 60, NY), e: wallToUtc(day + 1, 60, NY) }]
  expect(groupByDay(overnight, NY).map((g) => g.day)).toEqual([day, day + 1])
})

test('output stays in date order, including across weeks', () => {
  // Mon 2026-08-10 through Thu 2026-08-13, plus the Monday after — one hour each.
  const days: Slot[] = [0, 1, 2, 3, 7].map((i) => ({
    s: wallToUtc(day - 1 + i, 9 * 60, NY),
    e: wallToUtc(day - 1 + i, 10 * 60, NY),
  }))
  // Ordering by weekday instead of date used to print Aug 17 above Aug 11.
  expect(render(days, 'plain', options).split('\n')).toEqual([
    'Mon, Aug 10 — 9–10 AM',
    'Tue, Aug 11 — 9–10 AM',
    'Wed, Aug 12 — 9–10 AM',
    'Thu, Aug 13 — 9–10 AM',
    'Mon, Aug 17 — 9–10 AM',
  ])
})

test('a second timezone rides along in parentheses', () => {
  const dual = { ...options, theirTz: 'America/Los_Angeles' }
  expect(render(slots, 'plain', dual)).toBe('Tue, Aug 11 — 9–11 AM (6–8 AM), 2–3:30 PM (11 AM–12:30 PM)')
  // Same zone on both sides is not worth repeating.
  expect(render(slots, 'plain', { ...options, theirTz: NY })).toBe(render(slots, 'plain', options))
})

test('the second timezone names its weekday when the date differs there', () => {
  const tokyo = { ...options, theirTz: 'Asia/Tokyo' }
  // 9 PM Tuesday in New York is already 10 AM Wednesday in Tokyo.
  const evening: Slot[] = [{ s: wallToUtc(day, 21 * 60, NY), e: wallToUtc(day, 22 * 60, NY) }]
  expect(render(evening, 'plain', tokyo)).toBe('Tue, Aug 11 — 9–10 PM (Wed 10–11 AM)')

  // A range containing midnight in Tokyo needs a weekday on both ends.
  const straddling: Slot[] = [{ s: wallToUtc(day, 10 * 60, NY), e: wallToUtc(day, 12 * 60, NY) }]
  expect(render(straddling, 'plain', tokyo)).toBe('Tue, Aug 11 — 10 AM–12 PM (Tue 11 PM–Wed 1 AM)')
})

test('email format drops the redundant meridiem inside a range', () => {
  const text = render(slots, 'email', options)
  expect(text).toContain('Tue, Aug 11 — 9–11 AM, 2–3:30 PM')
})

test('unavailable blocks read as prose in the email format', () => {
  const busy: Slot[] = [{ s: wallToUtc(day, 12 * 60, NY), e: wallToUtc(day, 13 * 60, NY) }]
  expect(render(slots, 'email', options, busy)).toContain("I'm tied up Tue, Aug 11 12–1 PM.")
  expect(render([], 'email', options, busy)).toBe(
    "My schedule is fairly open — the only times that won't work are Tue, Aug 11 12–1 PM. Happy to fit in around whatever suits you.",
  )
  expect(render(slots, 'email', options)).not.toContain('tied up')
})

test('unavailable blocks get their own list or column in the other formats', () => {
  const busy: Slot[] = [{ s: wallToUtc(day, 12 * 60, NY), e: wallToUtc(day, 13 * 60, NY) }]
  expect(render(slots, 'bullets', options, busy)).toBe(
    "• Tue, Aug 11 — 9–11 AM, 2–3:30 PM\n\nCan't do:\n• Tue, Aug 11 — 12–1 PM",
  )
  expect(render(slots, 'compact', options, busy)).toBe(
    "Tue, Aug 11 9–11 AM, 2–3:30 PM — can't do Tue, Aug 11 12–1 PM",
  )
  expect(render(slots, 'markdown', options, busy)).toBe(
    "| Day | Available | Can't do |\n| --- | --- | --- |\n| Tue, Aug 11 | 9–11 AM, 2–3:30 PM | 12–1 PM |",
  )
  // A day with only busy time still gets a row.
  expect(render([], 'markdown', options, busy)).toContain('| Tue, Aug 11 | — | 12–1 PM |')
})

test('weekStart lands on the chosen start day, on or before the given day', () => {
  for (let dow = 0; dow < 7; dow++) {
    const start = weekStart(day, dow)
    expect(new Date(start * 86_400_000).getUTCDay()).toBe(dow)
    expect(day - start).toBeGreaterThanOrEqual(0)
    expect(day - start).toBeLessThan(7)
  }
  expect(weekStart(day)).toBe(weekStart(day, 1)) // defaults to Monday
})
