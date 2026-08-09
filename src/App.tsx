import { useEffect, useMemo, useState } from 'react'
import { WeekGrid } from './components/WeekGrid'
import { copyImage, copyText, download, toPng } from './lib/export'
import { FORMAT_LABELS, render, toIcs, type FormatId, type FormatOptions } from './lib/format'
import { DAY_NAMES, localTz, today, tzList, weekStart, type Slot } from './lib/time'
import { decodeState, encodeState, shareUrl } from './lib/url'

const FORMAT_IDS = Object.keys(FORMAT_LABELS) as FormatId[]
const ZONES = tzList()

const initial = decodeState(window.location.hash.slice(1))

export default function App() {
  const [tz, setTz] = useState(initial?.tz ?? localTz())
  const [slots, setSlots] = useState<Slot[]>(initial?.slots ?? [])
  const [format, setFormat] = useState<FormatId>('email')
  const [hour12, setHour12] = useState(true)
  const [showTz, setShowTz] = useState(true)
  const [relativeDays, setRelativeDays] = useState(false)
  const [longDates, setLongDates] = useState(false)
  const [offset, setOffset] = useState(0)
  const [startDow, setStartDow] = useState(1)
  const [toast, setToast] = useState('')

  const options: FormatOptions = { tz, hour12, showTz, relativeDays, longDates, startDow }

  const days = useMemo(() => {
    const start = weekStart(today(tz), startDow) + offset * 7
    return Array.from({ length: 7 }, (_, i) => start + i)
  }, [tz, offset, startDow])

  const text = render(slots, format, options)

  useEffect(() => {
    const hash = encodeState(slots, tz)
    window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname)
  }, [slots, tz])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2000)
  }

  const guard = (action: () => void | Promise<void>) => async () => {
    if (slots.length === 0) return flash('Pick some times first')
    await action()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Available Date Formatter</h1>
          <p className="text-sm text-slate-400">Drag across the calendar to mark when you're free, then copy it however you need it.</p>
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
            <span>{slots.length} block{slots.length === 1 ? '' : 's'}</span>
            <NavButton onClick={() => setSlots([])}>Clear all</NavButton>
          </div>
        </div>

        <WeekGrid days={days} slots={slots} tz={tz} hour12={hour12} onChange={setSlots} />
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
          </fieldset>

          <div className="flex flex-col gap-2">
            <Action primary onClick={guard(async () => { await copyText(text); flash('Text copied') })}>
              Copy text
            </Action>
            <Action
              onClick={guard(async () => {
                const how = await copyImage(toPng(slots, options), 'availability.png')
                flash(how === 'copied' ? 'PNG copied' : 'PNG downloaded')
              })}
            >
              Copy as PNG
            </Action>
            <Action onClick={guard(async () => { await copyText(shareUrl(slots, tz)); flash('Share link copied') })}>
              Copy share link
            </Action>
            <Action onClick={guard(() => download(toIcs(slots), 'availability.ics', 'text/calendar'))}>
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

function NavButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
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
