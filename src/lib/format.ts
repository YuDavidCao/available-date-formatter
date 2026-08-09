import { DAY_MS, dayDate, dayOfWeek, epochDayIn, tzAbbr, wallToUtc, type Slot } from './time'

export type FormatId = 'email' | 'bullets' | 'compact' | 'markdown' | 'plain' | 'poll'

export type FormatOptions = {
  tz: string
  hour12: boolean
  showTz: boolean
  relativeDays: boolean
  longDates: boolean
  startDow: number
}

export type DayGroup = { day: number; ranges: Slot[] }

/**
 * Split slots at midnight in `tz` and bucket them per civil day.
 * With `startDow`, days are ordered by weekday cycling from that day (Wednesday first, etc.);
 * otherwise chronologically.
 */
export function groupByDay(slots: readonly Slot[], tz: string, startDow?: number): DayGroup[] {
  const buckets = new Map<number, Slot[]>()
  for (const slot of slots) {
    let cursor = slot.s
    while (cursor < slot.e) {
      const day = epochDayIn(cursor, tz)
      const dayEnd = Math.min(slot.e, wallToUtc(day + 1, 0, tz))
      buckets.set(day, [...(buckets.get(day) ?? []), { s: cursor, e: dayEnd }])
      cursor = dayEnd
    }
  }

  const rank = (day: number) => (startDow === undefined ? 0 : dayOfWeek(day, startDow))
  return [...buckets.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0] - b[0])
    .map(([day, ranges]) => ({ day, ranges }))
}

function timeParts(utcMs: number, o: FormatOptions) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: o.tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: o.hour12,
  }).formatToParts(utcMs)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const clock = o.hour12 && get('minute') === '00' ? get('hour') : `${get('hour')}:${get('minute')}`
  return { clock, meridiem: get('dayPeriod').toLowerCase().replace(/\s/g, '') }
}

export function formatRange(range: Slot, o: FormatOptions): string {
  const a = timeParts(range.s, o)
  const b = timeParts(range.e, o)
  if (!o.hour12) return `${a.clock}–${b.clock}`
  // Drop the redundant meridiem when both ends share it: "9–11 AM".
  const left = a.meridiem === b.meridiem ? a.clock : `${a.clock} ${a.meridiem.toUpperCase()}`
  return `${left}–${b.clock} ${b.meridiem.toUpperCase()}`
}

export function formatDay(day: number, o: FormatOptions): string {
  if (o.relativeDays) {
    const diff = day - epochDayIn(Date.now(), o.tz)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: o.longDates ? 'long' : 'short',
    month: o.longDates ? 'long' : 'short',
    day: 'numeric',
  }).format(dayDate(day))
}

function zoneSuffix(groups: DayGroup[], o: FormatOptions): string {
  if (!o.showTz || groups.length === 0) return ''
  return ` ${tzAbbr(groups[0].ranges[0].s, o.tz)}`
}

function lines(groups: DayGroup[], o: FormatOptions, bullet: string): string[] {
  return groups.map(
    (g) => `${bullet}${formatDay(g.day, o)} — ${g.ranges.map((r) => formatRange(r, o)).join(', ')}`,
  )
}

const RENDERERS: Record<FormatId, (g: DayGroup[], o: FormatOptions) => string> = {
  email: (g, o) =>
    [
      `Here are a few times that work on my end${o.showTz ? ` (all times${zoneSuffix(g, o)})` : ''}:`,
      '',
      ...lines(g, o, '  • '),
      '',
      'Happy to work around your schedule if none of these fit.',
    ].join('\n'),

  bullets: (g, o) => lines(g, o, '• ').join('\n'),

  plain: (g, o) => lines(g, o, '').join('\n'),

  compact: (g, o) =>
    g
      .map((d) => `${formatDay(d.day, o)} ${d.ranges.map((r) => formatRange(r, o)).join(', ')}`)
      .join(' · ') + zoneSuffix(g, o),

  markdown: (g, o) =>
    [
      `| Day | Available${o.showTz ? ` (${zoneSuffix(g, o).trim()})` : ''} |`,
      '| --- | --- |',
      ...g.map((d) => `| ${formatDay(d.day, o)} | ${d.ranges.map((r) => formatRange(r, o)).join(', ')} |`),
    ].join('\n'),

  poll: (g, o) =>
    g
      .flatMap((d) => d.ranges.map((r) => `[ ] ${formatDay(d.day, o)}, ${formatRange(r, o)}`))
      .join('\n') + (o.showTz ? `\n\n(times${zoneSuffix(g, o)})` : ''),
}

export const FORMAT_LABELS: Record<FormatId, string> = {
  email: 'Email',
  bullets: 'Bullets',
  plain: 'Plain lines',
  compact: 'One line',
  markdown: 'Markdown table',
  poll: 'Checklist / poll',
}

export function render(slots: readonly Slot[], format: FormatId, o: FormatOptions): string {
  const groups = groupByDay(slots, o.tz, o.startDow)
  if (groups.length === 0) return ''
  return RENDERERS[format](groups, o)
}

function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function toIcs(slots: readonly Slot[], title = 'Available'): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//available-date-formatter//EN',
    ...slots.flatMap((s, i) => [
      'BEGIN:VEVENT',
      `UID:${s.s}-${i}@available-date-formatter`,
      `DTSTAMP:${icsStamp(Math.floor(Date.now() / DAY_MS) * DAY_MS)}`,
      `DTSTART:${icsStamp(s.s)}`,
      `DTEND:${icsStamp(s.e)}`,
      `SUMMARY:${title}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')
}
