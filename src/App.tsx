import { useEffect, useMemo, useState } from 'react'
import { WeekGrid, type Mode, type Selection } from './components/WeekGrid'
import { copyImage, copyText, download, toPng } from './lib/export'
import { FORMAT_LABELS, render, toIcs, type FormatId, type FormatOptions } from './lib/format'
import { DAY_NAMES, localTz, today, tzList, weekStart, type Slot } from './lib/time'
import { decodeState, encodeState, shareUrl } from './lib/url'

const FORMAT_IDS = Object.keys(FORMAT_LABELS) as FormatId[]
const ZONES = tzList()
const HISTORY_MAX = 50

const initial = decodeState(window.location.hash.slice(1))

export default function App() {
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

  const options: FormatOptions = { tz, theirTz: theirTz || undefined, hour12, showTz, relativeDays, longDates }

  const days = useMemo(() => {
    const start = weekStart(today(tz), startDow) + offset * 7
    return Array.from({ length: 7 }, (_, i) => start + i)
  }, [tz, offset, startDow])

  const text = render(slots, format, options, busy)

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
    if (slots.length === 0 && busy.length === 0) return flash('Pick some times first')
    await action()
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Available Date Formatter</h1>
          <p className="text-sm text-slate-400">Drag across the calendar to mark when you're free — or switch to Unavailable to block time off — then copy it however you need it.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Timezone</span>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="max-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NavButton onClick={() => setOffset(offset - 1)}>←</NavButton>
            <NavButton onClick={() => setOffset(0)}>This week</NavButton>
            <NavButton onClick={() => setOffset(offset + 1)}>→</NavButton>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <span>Week starts</span>
              <select
                value={startDow}
                onChange={(e) => setStartDow(Number(e.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                {DAY_NAMES.map((name, dow) => (
                  <option key={name} value={dow}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="flex overflow-hidden rounded-lg border border-slate-700">
              <ModeButton active={mode === 'available'} onClick={() => setMode('available')} tone="sky">
                Available
              </ModeButton>
              <ModeButton active={mode === 'busy'} onClick={() => setMode('busy')} tone="rose">
                Unavailable
              </ModeButton>
            </div>
            <span>
              {slots.length} free
              {busy.length > 0 && ` · ${busy.length} busy`}
            </span>
            <NavButton disabled={history.length === 0} onClick={undo}>
              Undo
            </NavButton>
            <NavButton onClick={() => apply({ slots: [], busy: [] })}>Clear all</NavButton>
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
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {FORMAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  format === id
                    ? 'bg-sky-500 text-slate-950 font-medium'
                    : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {FORMAT_LABELS[id]}
              </button>
            ))}
          </div>

          <pre className="min-h-40 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm whitespace-pre-wrap text-slate-200">
            {text || 'Nothing selected yet — drag across the calendar above.'}
          </pre>
        </div>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <legend className="px-1 text-xs tracking-wide text-slate-400 uppercase">Text options</legend>
            <Toggle checked={hour12} onChange={setHour12} label="12-hour clock" />
            <Toggle checked={showTz} onChange={setShowTz} label="Include timezone" />
            <Toggle checked={relativeDays} onChange={setRelativeDays} label='Use "Today" / "Tomorrow"' />
            <Toggle checked={longDates} onChange={setLongDates} label="Long day names" />
            <label className="mt-1 flex flex-col gap-1 text-sm text-slate-300">
              <span>Also show in their timezone</span>
              <select
                value={theirTz}
                onChange={(e) => setTheirTz(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
              >
                <option value="">Off</option>
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Action primary onClick={guard(async () => { await copyText(text); flash('Text copied') })}>
              Copy text
            </Action>
            <Action
              onClick={guard(async () => {
                const how = await copyImage(toPng(slots, options, busy), 'availability.png')
                flash(how === 'copied' ? 'PNG copied' : 'PNG downloaded')
              })}
            >
              Copy as PNG
            </Action>
            <Action onClick={guard(async () => { await copyText(shareUrl(slots, tz, busy)); flash('Share link copied') })}>
              Copy share link
            </Action>
            <Action onClick={guard(() => download(toIcs(slots, busy), 'availability.ics', 'text/calendar'))}>
              Download .ics
            </Action>
          </div>

          <p className="text-xs text-slate-500">
            Share links encode the times in the URL itself — nothing is uploaded anywhere.
          </p>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function NavButton({
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
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function ModeButton({
  children,
  active,
  onClick,
  tone,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  tone: 'sky' | 'rose'
}) {
  const on = tone === 'sky' ? 'bg-sky-500 text-slate-950' : 'bg-rose-500 text-slate-950'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? on : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function Action({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
        primary ? 'bg-sky-500 text-slate-950 hover:bg-sky-400' : 'border border-slate-700 text-slate-200 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-sky-500"
      />
      {label}
    </label>
  )
}
