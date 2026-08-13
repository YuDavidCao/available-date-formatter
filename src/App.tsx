import { useEffect, useMemo, useState } from 'react'
import { WeekGrid } from './components/WeekGrid'
import { dayLabel, paint, type Mode, type Selection } from './lib/selection'
import { copyImage, copyText, download, toPng } from './lib/export'
import { FORMAT_LABELS, render, toIcs, type FormatId, type FormatOptions } from './lib/format'
import { LANGUAGE_NAMES, LANG_IDS, detectLang, type LangId } from './lib/i18n'
import { DAY_NAMES, dayDate, localTz, today, tzList, wallToUtc, weekStart, type Slot } from './lib/time'
import { decodeState, encodeState, shareUrl } from './lib/url'

const FORMAT_IDS = Object.keys(FORMAT_LABELS) as FormatId[]
const ZONES = tzList()
const HISTORY_MAX = 50
/** Formats that are tables or lists rather than prose, and need aligned type. */
const STRUCTURED = new Set<FormatId>(['markdown', 'poll'])

const initial = decodeState(window.location.hash.slice(1))

const monthDay = (day: number) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dayDate(day))

function weekSpan(days: number[]): string {
  const [first, last] = [days[0], days[days.length - 1]]
  const sameMonth = dayDate(first).getUTCMonth() === dayDate(last).getUTCMonth()
  return `${monthDay(first)} – ${sameMonth ? dayDate(last).getUTCDate() : monthDay(last)}`
}

function duration(list: Slot[]): string {
  const minutes = list.reduce((total, slot) => total + (slot.e - slot.s) / 60_000, 0)
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return [hours && `${hours}h`, rest && `${rest}m`].filter(Boolean).join(' ') || '0m'
}

export default function App() {
  const [lang, setLang] = useState<LangId>(detectLang)
  const [tz, setTz] = useState(initial?.tz ?? localTz())
  const [slots, setSlots] = useState<Slot[]>(initial?.slots ?? [])
  const [busy, setBusy] = useState<Slot[]>(initial?.busy ?? [])
  const [mode, setMode] = useState<Mode>('available')
  const [format, setFormat] = useState<FormatId>('email')
  const [hour12, setHour12] = useState(true)
  const [showTz, setShowTz] = useState(true)
  const [relativeDays, setRelativeDays] = useState(false)
  const [longDates, setLongDates] = useState(false)
  const [theirTz, setTheirTz] = useState('')
  const [offset, setOffset] = useState(0)
  const [startDow, setStartDow] = useState(1)
  const [toast, setToast] = useState('')
  const [history, setHistory] = useState<Selection[]>([])

  const options: FormatOptions = {
    tz,
    locale: lang,
    theirTz: theirTz || undefined,
    hour12,
    showTz,
    relativeDays,
    longDates,
  }

  const days = useMemo(() => {
    const start = weekStart(today(tz), startDow) + offset * 7
    return Array.from({ length: 7 }, (_, i) => start + i)
  }, [tz, offset, startDow])

  const text = render(slots, format, options, busy)
  const empty = slots.length === 0 && busy.length === 0

  useEffect(() => {
    const hash = encodeState(slots, tz, busy)
    window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname)
  }, [slots, busy, tz])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2000)
  }

  // Every edit routes through here, so undo only has to know about one path.
  const apply = (next: Selection) => {
    setHistory((past) => [...past.slice(-HISTORY_MAX + 1), { slots, busy }])
    setSlots(next.slots)
    setBusy(next.busy)
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory((past) => past.slice(0, -1))
    setSlots(previous.slots)
    setBusy(previous.busy)
    flash('Undone')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const guard = (action: () => void | Promise<void>) => async () => {
    if (empty) return flash('Pick some times first')
    await action()
  }

  return (
    <div className="mx-auto w-full max-w-[58rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-serif text-[27px] leading-none">Availability</h1>
          <p className="font-mono text-[11px] text-soft">Drag the grid, copy the message.</p>
        </div>
        <label className="flex items-baseline gap-2 font-mono text-[11px] text-soft">
          <span>Your timezone</span>
          <Select value={tz} onChange={setTz} className="max-w-52">
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </label>
      </header>

      <main>
      <section className="mt-10" aria-labelledby="grid-heading">
        <h2 id="grid-heading" className="sr-only">
          Mark your availability
        </h2>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-1">
            <Step label="Previous week" onClick={() => setOffset(offset - 1)}>
              ←
            </Step>
            <span aria-live="polite" className="min-w-32 text-center font-mono text-[13px] text-ink">
              {weekSpan(days)}
            </span>
            <Step label="Next week" onClick={() => setOffset(offset + 1)}>
              →
            </Step>
            {offset !== 0 && (
              <Quiet onClick={() => setOffset(0)}>
                Today
              </Quiet>
            )}
          </div>

          <div role="group" aria-label="What to mark" className="flex items-center gap-5">
            <Paint active={mode === 'available'} onClick={() => setMode('available')} label="Available" />
            <Paint active={mode === 'busy'} onClick={() => setMode('busy')} label="Unavailable" busy />
          </div>
        </div>

        <WeekGrid
          days={days}
          slots={slots}
          busy={busy}
          mode={mode}
          tz={tz}
          hour12={hour12}
          onChange={apply}
        />

        <AddBlock
          days={days}
          tz={tz}
          mode={mode}
          onAdd={(block) => {
            apply(paint({ slots, busy }, block, mode))
            flash(`Marked ${mode === 'busy' ? 'unavailable' : 'available'}`)
          }}
          onReject={flash}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[11px] text-soft">
          <p>
            {empty
              ? 'Nothing marked yet'
              : `${duration(slots)} free${busy.length ? ` · ${duration(busy)} blocked` : ''}`}
          </p>
          <div className="flex items-center gap-4">
            <Quiet onClick={undo} disabled={history.length === 0}>
              Undo
            </Quiet>
            <Quiet onClick={() => apply({ slots: [], busy: [] })} disabled={empty}>
              Clear all
            </Quiet>
          </div>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="message-heading">
        <h2 id="message-heading" className="sr-only">
          Your message
        </h2>
        <div
          role="group"
          aria-label="Message format"
          className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-rule pb-2.5"
        >
          {FORMAT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={format === id}
              onClick={() => setFormat(id)}
              className={`-mb-[11px] border-b pb-2.5 text-[13px] transition-colors ${
                format === id
                  ? 'border-mark font-medium text-ink'
                  : 'border-transparent text-soft hover:text-ink'
              }`}
            >
              {FORMAT_LABELS[id]}
            </button>
          ))}
        </div>

        <div className="border-l-2 border-mark pl-5 sm:pl-7">
          {empty ? (
            <p className="font-serif text-[19px] text-soft italic">
              Your message will appear here as you mark times.
            </p>
          ) : (
            <pre
              className={`overflow-x-auto whitespace-pre-wrap ${
                STRUCTURED.has(format)
                  ? 'font-mono text-[13px] leading-[1.8]'
                  : 'font-serif text-[19px] leading-[1.65]'
              }`}
            >
              {text}
            </pre>
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          <button
            type="button"
            onClick={guard(async () => {
              await copyText(text)
              flash('Text copied')
            })}
            className="bg-ink px-6 py-2.5 text-[13px] font-medium text-paper transition-colors hover:bg-mark"
          >
            Copy text
          </button>
          <div className="flex items-center gap-3 font-mono text-[12px] text-soft">
            <Quiet
              onClick={guard(async () => {
                const how = await copyImage(toPng(slots, options, busy), 'availability.png')
                flash(how === 'copied' ? 'Image copied' : 'Image downloaded')
              })}
            >
              Copy image
            </Quiet>
            <span aria-hidden>·</span>
            <Quiet
              onClick={guard(async () => {
                await copyText(shareUrl(slots, tz, busy))
                flash('Link copied')
              })}
            >
              Copy link
            </Quiet>
            <span aria-hidden>·</span>
            <Quiet
              onClick={guard(() =>
                download(toIcs(slots, busy, lang), 'availability.ics', 'text/calendar'),
              )}
            >
              Download .ics
            </Quiet>
          </div>
        </div>
      </section>

      <section className="mt-14 border-t border-rule pt-6" aria-labelledby="options-heading">
        <h2 id="options-heading" className="sr-only">
          Options
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
          <Check checked={hour12} onChange={setHour12} label="12-hour clock" />
          <Check checked={showTz} onChange={setShowTz} label="Name the timezone" />
          <Check checked={relativeDays} onChange={setRelativeDays} label="Today / Tomorrow" />
          <Check checked={longDates} onChange={setLongDates} label="Full day names" />
          <label className="flex items-baseline gap-2 font-mono text-[11px] text-soft">
            <span>Message language</span>
            <Select value={lang} onChange={(v) => setLang(v as LangId)}>
              {LANG_IDS.map((id) => (
                <option key={id} value={id}>
                  {LANGUAGE_NAMES[id]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-baseline gap-2 font-mono text-[11px] text-soft">
            <span>Week starts</span>
            <Select value={String(startDow)} onChange={(v) => setStartDow(Number(v))}>
              {DAY_NAMES.map((name, dow) => (
                <option key={name} value={dow}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-baseline gap-2 font-mono text-[11px] text-soft">
            <span>Also show in</span>
            <Select value={theirTz} onChange={setTheirTz} className="max-w-52">
              <option value="">Off</option>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="mt-6 font-mono text-[11px] text-soft">
          Times live in the link itself. Nothing is uploaded.
        </p>
      </section>
      </main>

      {/* Mounted always, so the live region exists before the first message lands in it. */}
      <div role="status" aria-live="polite" className="fixed bottom-8 left-1/2 -translate-x-1/2">
        {toast && (
          <span className="block bg-ink px-4 py-2 font-mono text-[12px] text-paper">{toast}</span>
        )}
      </div>
    </div>
  )
}

const toMinutes = (value: string): number => {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}

/** The grid needs a pointer. This does the same job with a keyboard. */
function AddBlock({
  days,
  tz,
  mode,
  onAdd,
  onReject,
}: {
  days: number[]
  tz: string
  mode: Mode
  onAdd: (block: Slot) => void
  onReject: (message: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('17:00')

  // Days shift as the week is paged, so hold a column index rather than a date.
  const day = days[Math.min(index, days.length - 1)]

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const [start, end] = [toMinutes(from), toMinutes(to)]
    if (!Number.isFinite(start) || !Number.isFinite(end)) return onReject('Enter both times')
    if (end <= start) return onReject('End time must be after the start time')
    onAdd({ s: wallToUtc(day, start, tz), e: wallToUtc(day, end, tz) })
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2 font-mono text-[11px] text-soft"
    >
      <span>Or type it</span>
      <label className="flex items-baseline gap-1.5">
        <span className="sr-only">Day</span>
        <Select value={String(index)} onChange={(v) => setIndex(Number(v))}>
          {days.map((value, i) => (
            <option key={value} value={i}>
              {dayLabel(value)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-baseline gap-1.5">
        <span>from</span>
        <Time value={from} onChange={setFrom} />
      </label>
      <label className="flex items-baseline gap-1.5">
        <span>to</span>
        <Time value={to} onChange={setTo} />
      </label>
      <button
        type="submit"
        className="border-b border-rule pb-0.5 text-[12px] text-ink transition-colors hover:border-ink"
      >
        Mark {mode === 'busy' ? 'unavailable' : 'available'}
      </button>
    </form>
  )
}

function Time({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="time"
      step={900}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-b border-rule bg-transparent pb-0.5 font-mono text-[12px] text-ink transition-colors hover:border-ink"
    />
  )
}

function Select({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border-b border-rule bg-transparent pb-0.5 font-mono text-[12px] text-ink transition-colors hover:border-ink ${className}`}
    >
      {children}
    </select>
  )
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="px-2 py-1 font-mono text-[13px] text-soft transition-colors hover:text-ink"
    >
      {children}
    </button>
  )
}

/** The swatch shows what this brush paints, so the grid needs no separate legend. */
function Paint({
  active,
  onClick,
  label,
  busy,
}: {
  active: boolean
  onClick: () => void
  label: string
  busy?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 border-b pb-1 text-[13px] transition-colors ${
        active ? 'border-ink text-ink' : 'border-transparent text-soft hover:text-ink'
      }`}
    >
      <span
        aria-hidden
        className={`h-3.5 w-3.5 border-l-2 ${busy ? 'hatched border-ink/30' : 'border-mark bg-mark/10'}`}
      />
      {label}
    </button>
  )
}

function Quiet({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-mono text-[12px] text-soft underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-mark disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-mark"
      />
      {label}
    </label>
  )
}
