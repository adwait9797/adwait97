import { Button, Preloader, Sheet } from 'konsta/react'
import { useState } from 'react'
import { addWorkout } from '../lib/api'
import { today } from '../lib/dates'
import { isoDaysAgo } from '../lib/workoutStats'
import type { PlanDay } from '../lib/types'
import { Seg } from './Seg'

export const EXTRA_DAYS = ['Cardio', 'Other']

export function dayOptions(plan: PlanDay[]): string[] {
  return [...plan.map((d) => d.name), ...EXTRA_DAYS.filter((n) => !plan.some((d) => d.name === n))]
}

export function DayChips({
  options,
  value,
  suggested,
  onChange,
}: {
  options: string[]
  value: string
  suggested?: string | null
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`rounded-full px-4 py-2 text-[15px] font-semibold transition ${
            value === n ? 'bg-primary text-black' : 'bg-card-2 text-white'
          }`}
        >
          {n}
          {n === suggested && value !== n && <span className="ml-1 text-xs text-primary">• next</span>}
        </button>
      ))}
    </div>
  )
}

/** "I trained today": just the split, no exercise detail. */
export function QuickLogSheet({
  opened,
  plan,
  suggestedDay,
  onClose,
  onSaved,
}: {
  opened: boolean
  plan: PlanDay[]
  suggestedDay: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [day, setDay] = useState<string | null>(null)
  const [when, setWhen] = useState<'today' | 'yesterday'>('today')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = day ?? suggestedDay ?? plan[0]?.name ?? 'Other'

  function close() {
    setDay(null)
    setWhen('today')
    setError(null)
    onClose()
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await addWorkout({
        local_date: when === 'today' ? today() : isoDaysAgo(1),
        day_name: chosen,
        exercises: [],
        duration_min: null,
        notes: null,
      })
      onSaved()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet opened={opened} onBackdropClick={close} className="rounded-t-3xl bg-card!">
      <div className="pb-safe space-y-5 px-4 pt-3">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
        <div>
          <h2 className="text-[22px] font-bold">Quick log</h2>
          <p className="text-[14px] text-muted">Just record that you trained. Friends will see it.</p>
        </div>
        <Seg
          value={when}
          onChange={setWhen}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
          ]}
        />
        <section>
          <h3 className="mb-2 text-[13px] font-medium tracking-wide text-muted uppercase">Which split?</h3>
          <DayChips options={dayOptions(plan)} value={chosen} suggested={suggestedDay} onChange={setDay} />
        </section>
        {error && <p className="text-center text-sm text-move">{error}</p>}
        <Button large rounded disabled={busy} onClick={save} className="font-semibold text-black">
          {busy ? <Preloader className="h-5! w-5!" /> : `Log ${chosen} day`}
        </Button>
      </div>
    </Sheet>
  )
}
