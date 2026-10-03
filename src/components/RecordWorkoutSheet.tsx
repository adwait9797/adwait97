import { Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useEffect, useState } from 'react'
import { addWorkout } from '../lib/api'
import { today, toISODate } from '../lib/dates'
import type { PlanDay, WorkoutExercise } from '../lib/types'
import { ExercisePicker } from './ExercisePicker'
import { IconCheck, IconClose, IconPlus } from './icons'
import { NumStepper } from './NumStepper'
import { Seg } from './Seg'

const EXTRA_DAYS = ['Cardio', 'Other']

function toWorkoutExercises(day: PlanDay | undefined): WorkoutExercise[] {
  return (day?.exercises ?? []).map((e) => ({ ...e, weight_kg: null, done: true }))
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toISODate(d)
}

export function RecordWorkoutSheet({
  opened,
  plan,
  suggestedDay,
  onClose,
  onSaved,
}: {
  opened: boolean
  plan: PlanDay[]
  /** Next day in the rotation, preselected. */
  suggestedDay: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [dayName, setDayName] = useState<string>('')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [duration, setDuration] = useState(60)
  const [when, setWhen] = useState<'today' | 'yesterday'>('today')
  const [notes, setNotes] = useState('')
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    const initial = suggestedDay ?? plan[0]?.name ?? 'Other'
    setDayName(initial)
    setExercises(toWorkoutExercises(plan.find((d) => d.name === initial)))
    setDuration(60)
    setWhen('today')
    setNotes('')
    setError(null)
  }, [opened, plan, suggestedDay])

  function chooseDay(name: string) {
    setDayName(name)
    setExercises(toWorkoutExercises(plan.find((d) => d.name === name)))
  }

  function patch(i: number, p: Partial<WorkoutExercise>) {
    setExercises(exercises.map((e, j) => (j === i ? { ...e, ...p } : e)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await addWorkout({
        local_date: when === 'today' ? today() : yesterday(),
        day_name: dayName,
        exercises,
        duration_min: duration,
        notes: notes.trim() || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save workout')
    } finally {
      setBusy(false)
    }
  }

  const dayOptions = [...plan.map((d) => d.name), ...EXTRA_DAYS.filter((n) => !plan.some((d) => d.name === n))]

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar
          title="Record Workout"
          left={
            <Link onClick={onClose}>
              Cancel
            </Link>
          }
          right={
            <Link onClick={busy ? undefined : save} className="font-semibold">
              {busy ? <Preloader className="h-5! w-5!" /> : 'Save'}
            </Link>
          }
        />

        <div className="space-y-5 px-4 py-4 pb-16">
          {error && <p className="text-center text-sm text-move">{error}</p>}

          <Seg
            value={when}
            onChange={setWhen}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
            ]}
          />

          <section>
            <h3 className="mb-2 text-[13px] font-medium tracking-wide text-muted uppercase">What did you train?</h3>
            <div className="flex flex-wrap gap-2">
              {dayOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => chooseDay(n)}
                  className={`rounded-full px-4 py-2 text-[15px] font-semibold transition ${
                    dayName === n ? 'bg-primary text-black' : 'bg-card text-white'
                  }`}
                >
                  {n}
                  {n === suggestedDay && dayName !== n && <span className="ml-1 text-xs text-primary">• next</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-card p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold">Exercises</h3>
              <span className="text-sm text-muted">
                {exercises.filter((e) => e.done).length}/{exercises.length} done
              </span>
            </div>
            {exercises.length === 0 && <p className="py-2 text-sm text-muted">Add what you did, or just save.</p>}
            <ul className="divide-y divide-white/10">
              {exercises.map((e, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    aria-label={e.done ? 'Mark not done' : 'Mark done'}
                    onClick={() => patch(i, { done: !e.done })}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      e.done ? 'border-primary bg-primary text-black' : 'border-white/30'
                    }`}
                  >
                    {e.done && <IconCheck size={16} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[15px] ${e.done ? '' : 'text-muted'}`}>{e.name}</div>
                    <div className="num mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={e.sets}
                        onChange={(ev) => patch(i, { sets: Math.max(1, Number(ev.target.value) || 1) })}
                        className="w-9 rounded bg-card-2 text-center text-white outline-none"
                        aria-label="sets"
                      />
                      ×
                      <input
                        type="number"
                        inputMode="numeric"
                        value={e.reps}
                        onChange={(ev) => patch(i, { reps: Math.max(1, Number(ev.target.value) || 1) })}
                        className="w-9 rounded bg-card-2 text-center text-white outline-none"
                        aria-label="reps"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="–"
                      value={e.weight_kg ?? ''}
                      onChange={(ev) => patch(i, { weight_kg: ev.target.value === '' ? null : Number(ev.target.value) })}
                      className="num w-14 rounded-lg bg-card-2 py-1 text-center text-white outline-none focus:ring-2 focus:ring-primary"
                      aria-label="weight in kg"
                    />
                    <span className="text-xs text-muted">kg</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove ${e.name}`}
                    className="p-1 text-muted"
                    onClick={() => setExercises(exercises.filter((_, j) => j !== i))}
                  >
                    <IconClose size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-primary"
              onClick={() => setPicker(true)}
            >
              <IconPlus size={18} /> Add exercise
            </button>
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-card p-4">
            <div>
              <div className="text-[17px] font-semibold">Duration</div>
              <div className="num text-[28px] font-bold text-stand">{duration} min</div>
            </div>
            <NumStepper
              onPlus={() => setDuration(Math.min(300, duration + 5))}
              onMinus={() => setDuration(Math.max(5, duration - 5))}
            />
          </section>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional): PRs, how it felt…"
            rows={3}
            className="w-full resize-none rounded-2xl bg-card p-4 text-[16px] outline-none placeholder:text-muted"
          />
        </div>

        <ExercisePicker
          opened={picker}
          onClose={() => setPicker(false)}
          onPick={(name) => setExercises([...exercises, { name, sets: 3, reps: 10, weight_kg: null, done: true }])}
        />
      </Page>
    </Popup>
  )
}
