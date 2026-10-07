/** A block of availability, stored as absolute UTC milliseconds. */
export type Slot = { s: number; e: number }

export const DAY_MS = 86_400_000
export const MIN_MS = 60_000

/** Milliseconds to add to a UTC instant to get the local wall clock in `tz`. */
export function tzOffset(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcMs)
  const p: Record<string, string> = {}
  for (const { type, value } of parts) p[type] = value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - utcMs
}

/**
 * Wall clock (`epochDay` + `minutes` as read on a clock in `tz`) -> UTC instant.
 * Two passes so DST transitions resolve to the correct offset.
 */
export function wallToUtc(epochDay: number, minutes: number, tz: string): number {
  const wall = epochDay * DAY_MS + minutes * MIN_MS
  const first = wall - tzOffset(wall, tz)
  return wall - tzOffset(first, tz)
}

/** UTC instant -> minutes past midnight on `epochDay` in `tz`. */
export function utcToMinutes(utcMs: number, epochDay: number, tz: string): number {
  return (utcMs + tzOffset(utcMs, tz) - epochDay * DAY_MS) / MIN_MS
}

/** The civil date in `tz` containing `utcMs`, as days since 1970-01-01. */
export function epochDayIn(utcMs: number, tz: string): number {
  return Math.floor((utcMs + tzOffset(utcMs, tz)) / DAY_MS)
}

export function today(tz: string): number {
  return epochDayIn(Date.now(), tz)
}

/** Days from the most recent `startDow` (0 = Sunday) to `epochDay`, 0–6. */
export function dayOfWeek(epochDay: number, startDow: number): number {
  return (((epochDay + 4 - startDow) % 7) + 7) % 7 // 1970-01-01 was a Thursday
}

/** Start of the week containing `epochDay`, for a week beginning on `startDow` (0 = Sunday). */
export function weekStart(epochDay: number, startDow = 1): number {
  return epochDay - dayOfWeek(epochDay, startDow)
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayDate(epochDay: number): Date {
  return new Date(epochDay * DAY_MS)
}

export function localTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

// ponytail: hand-picked common zones, roughly west to east; add more if someone asks
const COMMON_ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Mexico_City',
  'America/Bogota',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Pacific/Auckland',
]

/** Common zones, with the given ones (local, current selection) first if missing. */
export function tzList(...pinned: string[]): string[] {
  const extra = [...new Set([localTz(), ...pinned])].filter((z) => z && !COMMON_ZONES.includes(z))
  return [...extra, ...COMMON_ZONES]
}

/** Offset of `tz` relative to `base` right now, e.g. "+9h", "-5h30m"; empty when equal. */
export function tzDiff(tz: string, base = localTz(), at = Date.now()): string {
  const minutes = Math.round((tzOffset(at, tz) - tzOffset(at, base)) / MIN_MS)
  if (minutes === 0) return ''
  const abs = Math.abs(minutes)
  const rest = abs % 60 ? `${abs % 60}m` : ''
  return `${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}h${rest}`
}

/** Short zone label, e.g. "PST" or "GMT+8". */
export function tzAbbr(utcMs: number, tz: string, locale = 'en'): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(utcMs)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? tz
}

/** Merge overlapping and back-to-back slots. Returns a new sorted array. */
export function normalize(slots: readonly Slot[]): Slot[] {
  const sorted = [...slots].filter((s) => s.e > s.s).sort((a, b) => a.s - b.s)
  return sorted.reduce<Slot[]>((acc, slot) => {
    const last = acc[acc.length - 1]
    if (last && slot.s <= last.e) return [...acc.slice(0, -1), { s: last.s, e: Math.max(last.e, slot.e) }]
    return [...acc, slot]
  }, [])
}

/** Remove `cut` from every slot, splitting where it lands in the middle. */
export function subtract(slots: readonly Slot[], cut: Slot): Slot[] {
  return normalize(
    slots.flatMap((s) => {
      if (cut.e <= s.s || cut.s >= s.e) return [s]
      return [
        { s: s.s, e: Math.min(s.e, cut.s) },
        { s: Math.max(s.s, cut.e), e: s.e },
      ].filter((p) => p.e > p.s)
    }),
  )
}
