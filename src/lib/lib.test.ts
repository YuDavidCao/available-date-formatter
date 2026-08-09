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
  startDow: 1,
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
  expect(decodeState(encoded)).toEqual({ slots: normalize(slots), tz: NY })
  expect(encoded.length - NY.length).toBeLessThan(20) // ~3 chars per slot plus the base
})

test('decodeState rejects junk instead of throwing', () => {
  expect(decodeState('not-a-payload')).toBe(null)
  expect(decodeState('')).toBe(null)
})

test('grouping splits a block that crosses midnight in the display zone', () => {
  const overnight: Slot[] = [{ s: wallToUtc(day, 23 * 60, NY), e: wallToUtc(day + 1, 60, NY) }]
  expect(groupByDay(overnight, NY).map((g) => g.day)).toEqual([day, day + 1])
})

test('output starts on the chosen week start day', () => {
  // Mon 2026-08-10 through Thu 2026-08-13, one hour each.
  const week: Slot[] = [0, 1, 2, 3].map((i) => ({
    s: wallToUtc(day - 1 + i, 9 * 60, NY),
    e: wallToUtc(day - 1 + i, 10 * 60, NY),
  }))
  const firstLine = (startDow: number) => render(week, 'plain', { ...options, startDow }).split('\n')[0]

  expect(firstLine(1)).toContain('Mon')
  expect(firstLine(3)).toContain('Wed')
  expect(render(week, 'plain', { ...options, startDow: 3 }).split('\n').map((l) => l.slice(0, 3)))
    .toEqual(['Wed', 'Thu', 'Mon', 'Tue'])
})

test('email format drops the redundant meridiem inside a range', () => {
  const text = render(slots, 'email', options)
  expect(text).toContain('Tue, Aug 11 — 9–11 AM, 2–3:30 PM')
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
