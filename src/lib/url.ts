import { MIN_MS, normalize, type Slot } from './time'

/**
 * Compact URL codec. Times are quantized to 5 minutes and stored as
 * base64url varints relative to the previous slot's end, so a typical
 * slot costs 2-3 characters instead of ~26 for two ISO timestamps.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const CONT = 32
const UNIT_MS = 5 * MIN_MS
const VERSION = 'A'

function writeVarint(n: number): string {
  let rest = Math.max(0, Math.round(n))
  let out = ''
  do {
    const digit = rest & 31
    rest = Math.floor(rest / 32)
    out += ALPHABET[digit | (rest > 0 ? CONT : 0)]
  } while (rest > 0)
  return out
}

function readVarint(src: string, i: number): [value: number, next: number] {
  let value = 0
  let shift = 1
  let cursor = i
  for (;;) {
    const digit = ALPHABET.indexOf(src[cursor])
    if (digit < 0) throw new Error('bad varint')
    value += (digit & 31) * shift
    cursor += 1
    if (!(digit & CONT)) return [value, cursor]
    shift *= 32
  }
}

function pack(slots: readonly Slot[]): string {
  const merged = normalize(slots)
  if (merged.length === 0) return ''
  const base = Math.round(merged[0].s / UNIT_MS)
  let cursor = base
  let body = ''
  for (const slot of merged) {
    const start = Math.round(slot.s / UNIT_MS)
    const end = Math.round(slot.e / UNIT_MS)
    body += writeVarint(start - cursor) + writeVarint(Math.max(1, end - start))
    cursor = end
  }
  return `${writeVarint(base)}${body}`
}

function unpack(packed: string): Slot[] {
  if (!packed) return []
  let [cursor, i] = readVarint(packed, 0)
  const slots: Slot[] = []
  while (i < packed.length) {
    const [gap, afterGap] = readVarint(packed, i)
    const [len, afterLen] = readVarint(packed, afterGap)
    const start = cursor + gap
    slots.push({ s: start * UNIT_MS, e: (start + len) * UNIT_MS })
    cursor = start + len
    i = afterLen
  }
  return normalize(slots)
}

/** Busy blocks ride along after a `!`, so links written before they existed still decode. */
export function encodeState(slots: readonly Slot[], tz: string, busy: readonly Slot[] = []): string {
  const free = pack(slots)
  const blocked = pack(busy)
  if (!free && !blocked) return ''
  return `${VERSION}${free}${blocked ? `!${blocked}` : ''}~${tz}`
}

export function decodeState(hash: string): { slots: Slot[]; busy: Slot[]; tz?: string } | null {
  if (!hash || hash[0] !== VERSION) return null
  try {
    const [payload, tz] = hash.slice(1).split('~')
    const [free, blocked = ''] = payload.split('!')
    return { slots: unpack(free), busy: unpack(blocked), tz: tz || undefined }
  } catch {
    return null
  }
}

export function shareUrl(slots: readonly Slot[], tz: string, busy: readonly Slot[] = []): string {
  const encoded = encodeState(slots, tz, busy)
  const { origin, pathname } = window.location
  return encoded ? `${origin}${pathname}#${encoded}` : `${origin}${pathname}`
}
