import { DAY_MS, dayDate, epochDayIn, tzAbbr, wallToUtc, type Slot } from './time'

export type FormatId = 'email' | 'bullets' | 'compact' | 'markdown' | 'plain' | 'poll'

export type FormatOptions = {
  tz: string
  /** When set, every range also shows on the recipient's clock. */
  theirTz?: string
  hour12: boolean
  showTz: boolean
  relativeDays: boolean
  longDates: boolean
}

export type DayGroup = { day: number; ranges: Slot[] }

/**
 * Split slots at midnight in `tz` and bucket them per civil day, chronologically.
 * A single grid week already runs from the chosen start day, so date order
 * reproduces it; across weeks, only date order stays truthful.
 */
export function groupByDay(slots: readonly Slot[], tz: string): DayGroup[] {
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

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, ranges]) => ({ day, ranges }))
}

function timeParts(utcMs: number, o: FormatOptions, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: o.hour12,
  }).formatToParts(utcMs)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const clock = o.hour12 && get('minute') === '00' ? get('hour') : `${get('hour')}:${get('minute')}`
  return { clock, meridiem: get('dayPeriod').toUpperCase().replace(/\s/g, '') }
}

function clockRange(range: Slot, o: FormatOptions, tz: string): string {
  const a = timeParts(range.s, o, tz)
  const b = timeParts(range.e, o, tz)
  if (!o.hour12) return `${a.clock}–${b.clock}`
  // Drop the redundant meridiem when both ends share it: "9–11 AM".
  const left = a.meridiem === b.meridiem ? a.clock : `${a.clock} ${a.meridiem}`
  return `${left}–${b.clock} ${b.meridiem}`
}

const shortDay = (day: number) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dayDate(day))

/**
 * The same instant on the recipient's clock. Weekday markers appear only where their
 * date drifts from ours — 9 PM Tuesday here is already Wednesday in Tokyo.
 */
function theirRange(range: Slot, o: FormatOptions, tz: string): string {
  const ourDay = epochDayIn(range.s, o.tz)
  const from = epochDayIn(range.s, tz)
  const to = epochDayIn(range.e - 1, tz) // exclusive end: midnight closes the previous day
  if (from === to) {
    const clock = clockRange(range, o, tz)
    return from === ourDay ? clock : `${shortDay(from)} ${clock}`
  }
  // The range straddles midnight on their side, so each end needs its own day.
  const a = timeParts(range.s, o, tz)
  const b = timeParts(range.e, o, tz)
  const suffix = (part: { meridiem: string }) => (o.hour12 ? ` ${part.meridiem}` : '')
  return `${shortDay(from)} ${a.clock}${suffix(a)}–${shortDay(to)} ${b.clock}${suffix(b)}`
}

export function formatRange(range: Slot, o: FormatOptions): string {
  const ours = clockRange(range, o, o.tz)
  if (!o.theirTz || o.theirTz === o.tz) return ours
  const zone = o.showTz ? ` ${tzAbbr(range.s, o.theirTz)}` : ''
  return `${ours} (${theirRange(range, o, o.theirTz)}${zone})`
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

const BULLETS: Record<FormatId, string> = {
  email: '  • ',
  bullets: '• ',
  plain: '',
  compact: '',
  markdown: '',
  poll: '',
}

type Doc = { free: DayGroup[]; busy: DayGroup[] }

const dayCells = (d: DayGroup, o: FormatOptions) => d.ranges.map((r) => formatRange(r, o)).join(', ')

const inline = (d: DayGroup, o: FormatOptions) => `${formatDay(d.day, o)} ${dayCells(d, o)}`

/** "Tue, Aug 11 12–1 PM and Wed, Aug 12 3–4 PM" — busy time named mid-sentence. */
function sentenceList(groups: DayGroup[], o: FormatOptions): string {
  const parts = groups.flatMap((g) => g.ranges.map((r) => `${formatDay(g.day, o)} ${formatRange(r, o)}`))
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** Days appearing in either half, in the same order the two halves use. */
function mergedDays({ free, busy }: Doc): number[] {
  return [...new Set([...free, ...busy].map((g) => g.day))].sort((a, b) => a - b)
}

/** Available lines, then the busy ones under their own heading. */
function twoLists({ free, busy }: Doc, o: FormatOptions, bullet: string): string {
  const head = lines(free, o, bullet)
  if (busy.length === 0) return head.join('\n')
  const tail = ["Can't do:", ...lines(busy, o, bullet)]
  return (free.length ? [...head, '', ...tail] : tail).join('\n')
}

const RENDERERS: Record<FormatId, (d: Doc, o: FormatOptions) => string> = {
  email: ({ free, busy }, o) => {
    const zone = o.showTz ? ` (all times${zoneSuffix([...free, ...busy], o)})` : ''
    if (free.length === 0) {
      return `My schedule is fairly open${zone} — the only times that won't work are ${sentenceList(busy, o)}. Happy to fit in around whatever suits you.`
    }
    return [
      `Here are a few times that work on my end${zone}:`,
      '',
      ...lines(free, o, BULLETS.email),
      '',
      ...(busy.length ? [`I'm tied up ${sentenceList(busy, o)}.`, ''] : []),
      'Happy to work around your schedule if none of these fit.',
    ].join('\n')
  },

  bullets: (d, o) => twoLists(d, o, BULLETS.bullets),

  plain: (d, o) => twoLists(d, o, BULLETS.plain),

  compact: ({ free, busy }, o) => {
    const zone = zoneSuffix([...free, ...busy], o)
    const available = free.map((d) => inline(d, o)).join(' · ')
    const blocked = busy.length ? `can't do ${busy.map((d) => inline(d, o)).join(' · ')}` : ''
    if (!available) return `${blocked.charAt(0).toUpperCase()}${blocked.slice(1)}${zone}`
    return `${available}${zone}${blocked ? ` — ${blocked}` : ''}`
  },

  markdown: (doc, o) => {
    const { free, busy } = doc
    const zone = o.showTz ? ` (${zoneSuffix([...free, ...busy], o).trim()})` : ''
    const cellsFor = (groups: DayGroup[], day: number) => {
      const group = groups.find((g) => g.day === day)
      return group ? dayCells(group, o) : '—'
    }
    return [
      busy.length ? `| Day | Available${zone} | Can't do |` : `| Day | Available${zone} |`,
      busy.length ? '| --- | --- | --- |' : '| --- | --- |',
      ...mergedDays(doc).map((day) =>
        busy.length
          ? `| ${formatDay(day, o)} | ${cellsFor(free, day)} | ${cellsFor(busy, day)} |`
          : `| ${formatDay(day, o)} | ${cellsFor(free, day)} |`,
      ),
    ].join('\n')
  },

  poll: ({ free, busy }, o) =>
    [
      ...free.flatMap((d) => d.ranges.map((r) => `[ ] ${formatDay(d.day, o)}, ${formatRange(r, o)}`)),
      ...(busy.length ? ['', `Can't do: ${sentenceList(busy, o)}`] : []),
      ...(o.showTz ? ['', `(times${zoneSuffix([...free, ...busy], o)})`] : []),
    ].join('\n'),
}

export const FORMAT_LABELS: Record<FormatId, string> = {
  email: 'Email',
  bullets: 'Bullets',
  plain: 'Plain lines',
  compact: 'One line',
  markdown: 'Markdown table',
  poll: 'Checklist / poll',
}

export function render(
  slots: readonly Slot[],
  format: FormatId,
  o: FormatOptions,
  busy: readonly Slot[] = [],
): string {
  const doc: Doc = {
    free: groupByDay(slots, o.tz),
    busy: groupByDay(busy, o.tz),
  }
  if (doc.free.length === 0 && doc.busy.length === 0) return ''
  return RENDERERS[format](doc, o)
}

function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function toIcs(slots: readonly Slot[], busy: readonly Slot[] = []): string {
  const events = [
    ...slots.map((slot) => ({ slot, title: 'Available', transp: 'TRANSPARENT' })),
    ...busy.map((slot) => ({ slot, title: 'Unavailable', transp: 'OPAQUE' })),
  ]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//available-date-formatter//EN',
    ...events.flatMap(({ slot, title, transp }, i) => [
      'BEGIN:VEVENT',
      `UID:${slot.s}-${i}@available-date-formatter`,
      `DTSTAMP:${icsStamp(Math.floor(Date.now() / DAY_MS) * DAY_MS)}`,
      `DTSTART:${icsStamp(slot.s)}`,
      `DTEND:${icsStamp(slot.e)}`,
      `SUMMARY:${title}`,
      `TRANSP:${transp}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')
}
