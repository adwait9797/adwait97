import { Dialog, DialogButton, Sheet } from 'konsta/react'
import { useState, type ReactNode } from 'react'
import { deleteMeal, deleteWorkout } from '../lib/api'
import { prettyDate } from '../lib/dates'
import type { Meal, Workout } from '../lib/types'
import { CARDIO, cardioOf, fmtKm, formatSet, isQuickLog, paceLabel, setsOf, volume } from '../lib/workoutStats'
import { IconDumbbell, IconTrash } from './icons'

function BottomSheet({ opened, onClose, children }: { opened: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="rounded-t-3xl bg-card!">
      <div className="pb-safe max-h-[85vh] overflow-y-auto px-4 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25" />
        {children}
      </div>
    </Sheet>
  )
}

function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) {
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsk(true)}
        className="mt-5 mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-card-2 py-3.5 text-[16px] text-move active:bg-white/10"
      >
        <IconTrash size={18} /> {label}
      </button>
      <Dialog
        opened={ask}
        onBackdropClick={() => setAsk(false)}
        title={`${label}?`}
        content="This can't be undone."
        buttons={
          <>
            <DialogButton onClick={() => setAsk(false)}>Cancel</DialogButton>
            <DialogButton
              strong
              className="text-move!"
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await onConfirm()
                } finally {
                  setBusy(false)
                  setAsk(false)
                }
              }}
            >
              Delete
            </DialogButton>
          </>
        }
      />
    </>
  )
}

function Macro({ label, grams, color, kcalPerGram, total }: { label: string; grams: number; color: string; kcalPerGram: number; total: number }) {
  const pct = total > 0 ? Math.min(100, ((grams * kcalPerGram) / total) * 100) : 0
  return (
    <div className="flex-1">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="num text-[20px] font-bold">{grams}g</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function MealDetailSheet({ meal, onClose, onDeleted }: { meal: Meal | null; onClose: () => void; onDeleted: () => void }) {
  // Keep the last meal rendered while the sheet animates closed.
  const [shown, setShown] = useState<Meal | null>(meal)
  if (meal && meal !== shown) setShown(meal)
  const m = meal ?? shown
  return (
    <BottomSheet opened={!!meal} onClose={onClose}>
      {m && (
        <>
          <p className="text-[13px] font-medium text-muted">
            {prettyDate(m.local_date)} · {new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </p>
          <h2 className="text-[24px] leading-tight font-bold">{m.name}</h2>
          <div className="num mt-2 text-[44px] leading-none font-bold text-exercise">
            {m.calories}
            <span className="ml-1 text-[17px] font-semibold text-muted">kcal</span>
          </div>
          <div className="mt-4 flex gap-4">
            <Macro label="Protein" grams={m.protein_g} kcalPerGram={4} total={m.calories} color="#fa114f" />
            <Macro label="Carbs" grams={m.carbs_g} kcalPerGram={4} total={m.calories} color="#00d8ff" />
            <Macro label="Fat" grams={m.fat_g} kcalPerGram={9} total={m.calories} color="#ff9f0a" />
          </div>
          {m.items.length > 0 ? (
            <ul className="mt-5 divide-y divide-white/10 rounded-2xl bg-card-2">
              {m.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[16px]">{it.name}</div>
                    <div className="num text-[12px] text-muted">
                      {it.quantity} · P {Math.round(it.protein_g)} · C {Math.round(it.carbs_g)} · F {Math.round(it.fat_g)}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[16px] font-semibold">{Math.round(it.calories)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-[14px] text-muted">Entered manually, no item breakdown.</p>
          )}
          <DeleteButton
            label="Delete meal"
            onConfirm={async () => {
              await deleteMeal(m.id)
              onClose()
              onDeleted()
            }}
          />
        </>
      )}
    </BottomSheet>
  )
}

export function WorkoutDetailSheet({
  workout,
  onClose,
  onDeleted,
}: {
  workout: Workout | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [shown, setShown] = useState<Workout | null>(workout)
  if (workout && workout !== shown) setShown(workout)
  const w = workout ?? shown
  const total = w ? w.exercises.reduce((s, e) => s + volume(setsOf(e)), 0) : 0
  const setCount = w ? w.exercises.reduce((s, e) => s + setsOf(e).length, 0) : 0
  const cardio = w ? cardioOf(w) : null
  return (
    <BottomSheet opened={!!workout} onClose={onClose}>
      {w && (
        <>
          <p className="text-[13px] font-medium text-muted">{prettyDate(w.local_date)}</p>
          <h2 className="flex items-center gap-2 text-[24px] font-bold">
            {cardio ? <span>{CARDIO[cardio.kind].emoji}</span> : <IconDumbbell size={24} className="text-move" />} {w.day_name}
          </h2>
          {cardio ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {cardio.kind === 'walk' ? (
                <Stat label="Steps" value={cardio.steps ? cardio.steps.toLocaleString() : '–'} color="text-exercise" />
              ) : (
                <Stat label="Distance" value={cardio.distance_km ? `${fmtKm(cardio.distance_km)}km` : '–'} color="text-exercise" />
              )}
              <Stat label="Time" value={w.duration_min != null ? `${w.duration_min}m` : '–'} color="text-stand" />
              {cardio.kind === 'walk' ? (
                <Stat label="Distance" value={cardio.distance_km ? `${fmtKm(cardio.distance_km)}km` : '–'} color="text-move" />
              ) : (
                <Stat
                  label={cardio.kind === 'cycle' ? 'Speed km/h' : 'Pace /km'}
                  value={paceLabel(cardio, w.duration_min)?.replace(' km/h', '').replace(' /km', '') ?? '–'}
                  color="text-move"
                />
              )}
            </div>
          ) : isQuickLog(w) ? (
            <p className="mt-3 text-[15px] text-muted">Quick log: no exercise details recorded.</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Duration" value={w.duration_min != null ? `${w.duration_min}m` : '–'} color="text-stand" />
                <Stat label="Sets" value={String(setCount)} color="text-exercise" />
                <Stat label="Volume" value={total ? `${Math.round(total).toLocaleString()}kg` : '–'} color="text-move" />
              </div>
              <ul className="mt-4 space-y-2">
                {w.exercises.map((e, i) => {
                  const sets = setsOf(e)
                  return (
                    <li key={i} className="rounded-2xl bg-card-2 px-4 py-3">
                      <div className="text-[16px] font-semibold">{e.name}</div>
                      <div className="num mt-1 flex flex-wrap gap-1.5">
                        {sets.length === 0 && <span className="text-[13px] text-muted">Skipped</span>}
                        {sets.map((s, j) => (
                          <span key={j} className="rounded-md bg-black/40 px-2 py-0.5 text-[13px]">
                            {formatSet(s)}
                          </span>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {w.notes && <p className="mt-4 rounded-2xl bg-card-2 px-4 py-3 text-[15px] italic">“{w.notes}”</p>}
          <DeleteButton
            label="Delete workout"
            onConfirm={async () => {
              await deleteWorkout(w.id)
              onClose()
              onDeleted()
            }}
          />
        </>
      )}
    </BottomSheet>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-card-2 px-3 py-2.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num text-[20px] font-bold ${color}`}>{value}</div>
    </div>
  )
}

