import { dayDate, normalize, subtract, type Slot } from './time'

/** Which kind of block the next edit paints. */
export type Mode = 'available' | 'busy'

export type Selection = { slots: Slot[]; busy: Slot[] }

export function dayLabel(day: number): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dayDate(day))
}

/** Painting one kind carves the block out of the other — a time cannot be both. */
export function paint(current: Selection, block: Slot, mode: Mode): Selection {
  return mode === 'busy'
    ? { slots: subtract(current.slots, block), busy: normalize([...current.busy, block]) }
    : { slots: normalize([...current.slots, block]), busy: subtract(current.busy, block) }
}
