import { useEffect, useMemo, useRef, useState } from 'react'
import { groupByDay } from '../lib/format'
import { dayLabel, paint, type Mode, type Selection } from '../lib/selection'
import { dayDate, subtract, today, utcToMinutes, wallToUtc, type Slot } from '../lib/time'

const SNAP_MIN = 15
const HOUR_PX = 46
const DAY_MIN = 1440
const PX_PER_MIN = HOUR_PX / 60
const LABEL_MIN_PX = 30

type Drag = { day: number; anchor: number; cursor: number }

type Props = {
  days: number[]
  slots: Slot[]
  busy: Slot[]
  mode: Mode
  tz: string
  hour12: boolean
  onChange: (next: Selection) => void
}

function snap(minutes: number): number {
  return Math.max(0, Math.min(DAY_MIN, Math.round(minutes / SNAP_MIN) * SNAP_MIN))
}

function hourLabel(hour: number, hour12: boolean): string {
  if (!hour12) return `${String(hour).padStart(2, '0')}`
  if (hour === 12) return 'noon'
  return `${hour % 12}${hour < 12 ? 'am' : 'pm'}`
}

// The grid is the editing surface, not the message: it stays English whatever
// language the output is rendered in.
export function WeekGrid({ days, slots, busy, mode, tz, hour12, onChange }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  // Open on the working day rather than midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX
  }, [])

  const byDay = useMemo(() => {
    const map = new Map<number, Slot[]>()
    for (const group of groupByDay(slots, tz)) map.set(group.day, group.ranges)
    return map
  }, [slots, tz])

  const busyByDay = useMemo(() => {
    const map = new Map<number, Slot[]>()
    for (const group of groupByDay(busy, tz)) map.set(group.day, group.ranges)
    return map
  }, [busy, tz])

  /** Compact clock for the label inside a block: "9am", "9:30am". */
  const clock = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12 })
      .format(ms)
      .replace(':00', '')
      .replace(' ', '')
      .toLowerCase()

  const pointToCell = (e: React.PointerEvent | PointerEvent) => {
    const body = bodyRef.current
    if (!body) return null
    const rect = body.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * days.length)
    if (col < 0 || col >= days.length) return null
    return { day: days[col], minutes: snap((e.clientY - rect.top) / PX_PER_MIN) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const cell = pointToCell(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ day: cell.day, anchor: cell.minutes, cursor: cell.minutes + SNAP_MIN })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const cell = pointToCell(e)
    if (cell) setDrag({ ...drag, cursor: cell.minutes })
  }

  const commit = () => {
    if (!drag) return
    const from = Math.min(drag.anchor, drag.cursor)
    const to = Math.max(drag.anchor, drag.cursor, from + SNAP_MIN)
    const block = { s: wallToUtc(drag.day, from, tz), e: wallToUtc(drag.day, to, tz) }
    onChange(paint({ slots, busy }, block, mode))
    setDrag(null)
  }

  const preview = drag && {
    day: drag.day,
    top: Math.min(drag.anchor, drag.cursor) * PX_PER_MIN,
    height: Math.max(SNAP_MIN, Math.abs(drag.cursor - drag.anchor)) * PX_PER_MIN,
    label: `${Math.abs(drag.cursor - drag.anchor) || SNAP_MIN} min`,
  }

  const now = today(tz)

  return (
    <div>
      <div className="flex border-b border-rule">
        <div className="w-12 shrink-0" />
        {days.map((day) => {
          const date = dayDate(day)
          const isToday = day === now
          return (
            <div key={day} className="flex-1 pb-2.5 text-center">
              <div
                className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                  isToday ? 'text-mark' : 'text-soft'
                }`}
              >
                {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date)}
              </div>
              <div className={`font-mono text-[15px] ${isToday ? 'text-mark' : 'text-ink'}`}>
                {new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(date)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Focusable so the 24-hour scroll region can be reached by keyboard, not just by pointer. */}
      <div
        ref={scrollRef}
        tabIndex={0}
        role="group"
        aria-label="Week grid, midnight to midnight. Drag to mark times, or use the form below the grid."
        className="h-[400px] overflow-y-auto"
      >
        <div className="flex">
          <div className="w-12 shrink-0 select-none">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="relative text-right font-mono text-[10px] text-soft"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-1.5 right-2.5">
                  {hour ? hourLabel(hour, hour12) : ''}
                </span>
              </div>
            ))}
          </div>

          <div
            ref={bodyRef}
            className="relative flex-1 cursor-crosshair touch-none"
            style={{ height: DAY_MIN * PX_PER_MIN }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={commit}
            onPointerCancel={() => setDrag(null)}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="pointer-events-none absolute inset-x-0 border-t border-rule"
                style={{ top: hour * HOUR_PX }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {days.map((day) => (
                <div key={day} className="relative flex-1 border-l border-rule">
                  {[
                    { ranges: byDay.get(day) ?? [], busy: false },
                    { ranges: busyByDay.get(day) ?? [], busy: true },
                  ].flatMap(({ ranges, busy: isBusy }) =>
                    ranges.map((range) => {
                      const top = utcToMinutes(range.s, day, tz) * PX_PER_MIN
                      const height =
                        (utcToMinutes(range.e, day, tz) - utcToMinutes(range.s, day, tz)) * PX_PER_MIN
                      return (
                        <div
                          key={`${isBusy}-${range.s}`}
                          className={`group absolute inset-x-0 overflow-hidden border-l-2 ${
                            isBusy ? 'hatched border-ink/30' : 'border-mark bg-mark/10'
                          }`}
                          style={{ top, height }}
                        >
                          {height >= LABEL_MIN_PX && (
                            <span
                              className={`pointer-events-none block px-1.5 pt-1 font-mono text-[10px] leading-tight ${
                                isBusy ? 'text-soft' : 'text-mark'
                              }`}
                            >
                              {clock(range.s)}–{clock(range.e)}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${isBusy ? 'unavailable' : 'available'} block, ${dayLabel(day)} ${clock(range.s)} to ${clock(range.e)}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              onChange(
                                isBusy
                                  ? { slots, busy: subtract(busy, range) }
                                  : { slots: subtract(slots, range), busy },
                              )
                            }
                            className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center bg-paper/80 font-mono text-[13px] text-soft opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus:opacity-100"
                          >
                            ×
                          </button>
                        </div>
                      )
                    }),
                  )}

                  {preview?.day === day && (
                    <div
                      className={`pointer-events-none absolute inset-x-0 border-l-2 ${
                        mode === 'busy' ? 'hatched border-ink/40' : 'border-mark bg-mark/20'
                      }`}
                      style={{ top: preview.top, height: preview.height }}
                    >
                      <span className="block px-1.5 pt-1 font-mono text-[10px] text-ink">
                        {preview.label}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
