import { formatDay, formatRange, groupByDay, type DayGroup, type FormatOptions } from './format'
import { STRINGS } from './i18n'
import { tzAbbr, type Slot } from './time'

type Row = { kind: 'label'; text: string } | { kind: 'day'; group: DayGroup; busy: boolean }

const SCALE = 2
const PAD = 32
const ROW = 34
const WIDTH = 680

const PAPER = '#fbfaf8'
const INK = '#16181c'
const SOFT = '#6e7278'
const RULE = '#e7e4de'
const MARK = '#2b44d0'

/** Renders availability to a PNG blob on a canvas — no DOM screenshotting library needed. */
export async function toPng(
  slots: readonly Slot[],
  o: FormatOptions,
  busy: readonly Slot[] = [],
): Promise<Blob> {
  const t = STRINGS[o.locale]
  const groups = groupByDay(slots, o.tz)
  const busyGroups = groupByDay(busy, o.tz)
  const rows: Row[] = [
    ...groups.map((group): Row => ({ kind: 'day', group, busy: false })),
    ...(busyGroups.length ? [{ kind: 'label', text: t.unavailable } as Row] : []),
    ...busyGroups.map((group): Row => ({ kind: 'day', group, busy: true })),
  ]
  const header = 84
  const height = header + rows.length * ROW + PAD
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.fillStyle = MARK
  ctx.fillRect(0, 0, 3, height)

  const serif = (size: number) => `${size}px Newsreader, ui-serif, Georgia, serif`
  const mono = (size: number, weight = '400') =>
    `${weight} ${size}px "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace`

  ctx.fillStyle = INK
  ctx.font = serif(23)
  ctx.fillText(t.myAvailability, PAD, 44)

  ctx.fillStyle = SOFT
  ctx.font = mono(12)
  const anchor = groups[0] ?? busyGroups[0]
  const zone = anchor ? `${o.tz} · ${tzAbbr(anchor.ranges[0].s, o.tz, o.locale)}` : o.tz
  ctx.fillText(zone, PAD, 66)

  rows.forEach((row, i) => {
    const y = header + i * ROW
    if (row.kind === 'label') {
      ctx.fillStyle = SOFT
      ctx.font = mono(10, '500')
      ctx.fillText(row.text.toUpperCase(), PAD, y + 4)
      return
    }
    // A hairline per row instead of banding — the same rules the on-screen grid uses.
    ctx.fillStyle = RULE
    ctx.fillRect(PAD, y + 10, WIDTH - 2 * PAD, 1)
    ctx.fillStyle = INK
    ctx.font = serif(16)
    ctx.fillText(formatDay(row.group.day, o), PAD, y + 4)
    ctx.fillStyle = row.busy ? SOFT : MARK
    ctx.font = mono(13)
    ctx.fillText(row.group.ranges.map((r) => formatRange(r, o)).join('   ·   '), PAD + 190, y + 4)
  })

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png encode failed'))), 'image/png'),
  )
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/**
 * Copy an image to the clipboard, falling back to a download where unsupported (Firefox).
 * Takes a promise so Safari still sees the write inside the original user gesture.
 */
export async function copyImage(blob: Promise<Blob>, filename: string): Promise<'copied' | 'downloaded'> {
  try {
    if (!('ClipboardItem' in window)) throw new Error('no ClipboardItem')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'copied'
  } catch {
    download(await blob, filename)
    return 'downloaded'
  }
}

export function download(data: Blob | string, filename: string, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
