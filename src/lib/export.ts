import { formatDay, formatRange, groupByDay, type DayGroup, type FormatOptions } from './format'
import { tzAbbr, type Slot } from './time'

type Row = { kind: 'label'; text: string } | { kind: 'day'; group: DayGroup; busy: boolean }

const SCALE = 2
const PAD = 32
const ROW = 34
const WIDTH = 620

/** Renders availability to a PNG blob on a canvas — no DOM screenshotting library needed. */
export async function toPng(
  slots: readonly Slot[],
  o: FormatOptions,
  busy: readonly Slot[] = [],
): Promise<Blob> {
  const groups = groupByDay(slots, o.tz, o.startDow)
  const busyGroups = groupByDay(busy, o.tz, o.startDow)
  const rows: Row[] = [
    ...groups.map((group): Row => ({ kind: 'day', group, busy: false })),
    ...(busyGroups.length ? [{ kind: 'label', text: 'Not available' } as Row] : []),
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

  ctx.fillStyle = '#0b1120'
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, 0, 4, height)

  const font = (size: number, weight = '400') =>
    `${weight} ${size}px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`

  ctx.fillStyle = '#f8fafc'
  ctx.font = font(22, '600')
  ctx.fillText('My availability', PAD, 44)

  ctx.fillStyle = '#94a3b8'
  ctx.font = font(13)
  const anchor = groups[0] ?? busyGroups[0]
  const zone = anchor ? `${o.tz} · ${tzAbbr(anchor.ranges[0].s, o.tz)}` : o.tz
  ctx.fillText(zone, PAD, 66)

  rows.forEach((row, i) => {
    const y = header + i * ROW
    if (row.kind === 'label') {
      ctx.fillStyle = '#94a3b8'
      ctx.font = font(12, '600')
      ctx.fillText(row.text.toUpperCase(), PAD, y + 4)
      return
    }
    ctx.fillStyle = i % 2 ? '#0f172a' : '#111c31'
    ctx.fillRect(PAD - 12, y - 18, WIDTH - 2 * PAD + 24, ROW - 6)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = font(15, '600')
    ctx.fillText(formatDay(row.group.day, o), PAD, y + 4)
    ctx.fillStyle = row.busy ? '#fda4af' : '#7dd3fc'
    ctx.font = font(15)
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
