import { useEffect, useMemo, useRef, useState } from 'react'
import { groupByDay } from '../lib/format'
import { dayDate, normalize, subtract, today, utcToMinutes, wallToUtc, type Slot } from '../lib/time'

const SNAP_MIN = 15
const HOUR_PX = 48
const DAY_MIN = 1440
const PX_PER_MIN = HOUR_PX / 60

type Drag = { day: number; anchor: number; cursor: number }

type Props = {
  days: number[]
  slots: Slot[]
  tz: string
  hour12: boolean
  onChange: (slots: Slot[]) => void
}

function snap(minutes: number): number {
  return Math.max(0, Math.min(DAY_MIN, Math.round(minutes / SNAP_MIN) * SNAP_MIN))
}

function hourLabel(hour: number, hour12: boolean): string {
  if (!hour12) return `${String(hour).padStart(2, '0')}:00`
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`
}

export function WeekGrid({ days, slots, tz, hour12, onChange }: Props) {
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
    onChange(normalize([...slots, { s: wallToUtc(drag.day, from, tz), e: wallToUtc(drag.day, to, tz) }]))
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
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="flex border-b border-slate-800 bg-slate-900/80">
        <div className="w-16 shrink-0" />
        {days.map((day) => {
          const date = dayDate(day)
          return (
            <div
              key={day}
              className={`flex-1 py-2 text-center ${day === now ? 'text-sky-400' : 'text-slate-300'}`}
            >
              <div className="text-[11px] font-medium tracking-wide uppercase">
                {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date)}
              </div>
              <div className="text-sm font-semibold">
                {new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(date)}
              </div>
            </div>
          )
        })}
      </div>

      <div ref={scrollRef} className="h-[420px] overflow-y-auto">
        <div className="flex">
          <div className="w-16 shrink-0 select-none">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="relative text-right text-[11px] text-slate-500"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-1.5 right-2">{hour ? hourLabel(hour, hour12) : ''}</span>
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
                className="pointer-events-none absolute inset-x-0 border-t border-slate-800/70"
                style={{ top: hour * HOUR_PX }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {days.map((day) => (
                <div key={day} className="relative flex-1 border-l border-slate-800/70">
                  {(byDay.get(day) ?? []).map((range) => {
                    const top = utcToMinutes(range.s, day, tz) * PX_PER_MIN
                    const height = (utcToMinutes(range.e, day, tz) - utcToMinutes(range.s, day, tz)) * PX_PER_MIN
                    return (
                      <div
                        key={range.s}
                        className="group absolute inset-x-1 overflow-hidden rounded-lg bg-sky-500/25 ring-1 ring-sky-400/60 transition-colors hover:bg-sky-500/35"
                        style={{ top, height }}
                      >
                        <button
                          type="button"
                          aria-label="Remove this time block"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onChange(subtract(slots, range))}
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded text-xs text-sky-100 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sky-500/40 focus:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}

                  {preview?.day === day && (
                    <div
                      className="pointer-events-none absolute inset-x-1 rounded-lg bg-sky-400/40 ring-2 ring-sky-300"
                      style={{ top: preview.top, height: preview.height }}
                    >
                      <span className="px-1.5 text-[11px] font-medium text-white">{preview.label}</span>
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
