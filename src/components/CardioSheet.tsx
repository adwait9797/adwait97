import { Button, Preloader, Sheet } from 'konsta/react'
import { useState } from 'react'
import { addWorkout } from '../lib/api'
import { today } from '../lib/dates'
import type { CardioKind } from '../lib/types'
import { CARDIO, isoDaysAgo, paceLabel } from '../lib/workoutStats'
import { Seg } from './Seg'

function Field({
  label,
  unit,
  value,
  onChange,
  decimal,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  decimal?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[13px] font-medium tracking-wide text-muted uppercase">{label}</span>
      <div className="flex items-center rounded-xl bg-card-2 pr-4 focus-within:ring-2 focus-within:ring-primary">
        <input
          type="number"
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="num min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[20px] font-semibold outline-none placeholder:text-white/25"
        />
        <span className="text-[15px] text-muted">{unit}</span>
      </div>
    </label>
  )
}

/** Log a run, a ride or a day's steps. Saved as a workout so it counts on the leaderboard. */
export function CardioSheet({ opened, onClose, onSaved }: { opened: boolean; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<CardioKind>('run')
  const [when, setWhen] = useState<'today' | 'yesterday'>('today')
  const [km, setKm] = useState('')
  const [minutes, setMinutes] = useState('')
  const [steps, setSteps] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const distance = Number(km) > 0 ? Math.min(1000, Math.round(Number(km) * 100) / 100) : null
  const duration = Number(minutes) > 0 ? Math.min(600, Math.round(Number(minutes))) : null
  const stepCount = Number(steps) > 0 ? Math.min(200_000, Math.round(Number(steps))) : null
  const valid = kind === 'walk' ? !!stepCount || !!distance : !!distance || !!duration
  const pace = paceLabel({ kind, distance_km: distance, steps: null }, duration)

  function close() {
    setKm('')
    setMinutes('')
    setSteps('')
    setWhen('today')
    setError(null)
    onClose()
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const c = CARDIO[kind]
      await addWorkout({
        local_date: when === 'today' ? today() : isoDaysAgo(1),
        day_name: c.day,
        exercises: [
          {
            name: c.label,
            sets: 0,
            reps: 0,
            weight_kg: null,
            done: true,
            cardio: { kind, distance_km: distance, steps: kind === 'cycle' ? null : stepCount },
          },
        ],
        duration_min: duration,
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
      <form
        className="pb-safe max-h-[85dvh] space-y-4 overflow-y-auto px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !busy) save()
        }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
        <div>
          <h2 className="text-[22px] font-bold">Log cardio</h2>
          <p className="text-[14px] text-muted">Counts as a workout for the day. Friends see it.</p>
        </div>
        <Seg
          value={kind}
          onChange={setKind}
          options={(Object.keys(CARDIO) as CardioKind[]).map((k) => ({ value: k, label: `${CARDIO[k].emoji} ${CARDIO[k].label}` }))}
        />
        <Seg
          value={when}
          onChange={setWhen}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
          ]}
        />

        {kind === 'walk' ? (
          <>
            <Field label="Steps" unit="steps" value={steps} onChange={setSteps} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance" unit="km" value={km} onChange={setKm} decimal />
              <Field label="Time" unit="min" value={minutes} onChange={setMinutes} />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance" unit="km" value={km} onChange={setKm} decimal />
            <Field label="Time" unit="min" value={minutes} onChange={setMinutes} />
          </div>
        )}

        <p className="num h-5 text-center text-[15px] text-exercise">{pace && `${kind === 'cycle' ? 'Avg speed' : 'Pace'} ${pace}`}</p>

        {error && <p className="text-center text-sm text-move">{error}</p>}
        <Button large rounded type="submit" disabled={busy || !valid} className="font-semibold text-black">
          {busy ? <Preloader className="h-5! w-5!" /> : `Save ${CARDIO[kind].label.toLowerCase()}`}
        </Button>
      </form>
    </Sheet>
  )
}
