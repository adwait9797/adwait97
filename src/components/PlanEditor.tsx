import { Button } from 'konsta/react'
import { useState } from 'react'
import { isCardioExercise } from '../lib/exercises'
import type { PlanDay } from '../lib/types'
import { ExercisePicker } from './ExercisePicker'
import { IconClose, IconPlus, IconTrash } from './icons'

function NumberCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
        className="num w-11 rounded-lg bg-card-2 py-1 text-center text-[16px] outline-none focus:ring-2 focus:ring-primary"
      />
      <span className="text-xs text-muted">{label}</span>
    </label>
  )
}

/** Edit the days of a training plan and the exercises in each day. */
export function PlanEditor({ days, onChange }: { days: PlanDay[]; onChange: (d: PlanDay[]) => void }) {
  const [pickerFor, setPickerFor] = useState<number | null>(null)

  const update = (i: number, patch: Partial<PlanDay>) => onChange(days.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  return (
    <div className="space-y-4 px-4">
      {days.map((day, i) => (
        <div key={i} className="rounded-2xl bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={day.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={`Day ${i + 1}`}
              className="min-w-0 flex-1 bg-transparent text-[20px] font-bold outline-none"
            />
            {days.length > 1 && (
              <button
                type="button"
                aria-label="Remove day"
                className="rounded-full p-2 text-muted active:bg-card-2"
                onClick={() => onChange(days.filter((_, j) => j !== i))}
              >
                <IconTrash size={18} />
              </button>
            )}
          </div>
          {day.exercises.length === 0 && <p className="mb-2 text-sm text-muted">No exercises yet.</p>}
          <ul className="divide-y divide-white/10">
            {day.exercises.map((ex, k) => (
              <li key={k} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px]">{ex.name}</span>
                {isCardioExercise(ex.name) ? (
                  // Cardio: the plan stores target minutes in reps.
                  <NumberCell
                    label="min"
                    value={ex.reps}
                    onChange={(v) => update(i, { exercises: day.exercises.map((e, m) => (m === k ? { ...e, sets: 1, reps: v } : e)) })}
                  />
                ) : (
                  <>
                    <NumberCell
                      label="sets"
                      value={ex.sets}
                      onChange={(v) => update(i, { exercises: day.exercises.map((e, m) => (m === k ? { ...e, sets: v } : e)) })}
                    />
                    <NumberCell
                      label="reps"
                      value={ex.reps}
                      onChange={(v) => update(i, { exercises: day.exercises.map((e, m) => (m === k ? { ...e, reps: v } : e)) })}
                    />
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${ex.name}`}
                  className="p-1 text-muted"
                  onClick={() => update(i, { exercises: day.exercises.filter((_, m) => m !== k) })}
                >
                  <IconClose size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-primary"
            onClick={() => setPickerFor(i)}
          >
            <IconPlus size={18} /> Add exercise
          </button>
        </div>
      ))}

      <Button
        tonal
        rounded
        large
        onClick={() => onChange([...days, { position: days.length, name: `Day ${days.length + 1}`, exercises: [] }])}
      >
        <IconPlus size={18} className="mr-1" /> Add day
      </Button>

      <ExercisePicker
        opened={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(name) => {
          if (pickerFor === null) return
          const day = days[pickerFor]
          update(pickerFor, {
            exercises: [...day.exercises, isCardioExercise(name) ? { name, sets: 1, reps: 20 } : { name, sets: 3, reps: 10 }],
          })
        }}
      />
    </div>
  )
}
