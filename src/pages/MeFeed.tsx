import { Actions, ActionsButton, ActionsGroup, ActionsLabel } from 'konsta/react'
import { useState } from 'react'
import { IconDumbbell, IconFork } from '../components/icons'
import { Rings } from '../components/Rings'
import { deleteMeal, deleteWorkout } from '../lib/api'
import { parseISODate, prettyDate, today, WEEKDAY_LETTERS, weekDates } from '../lib/dates'
import type { Meal, Profile, Workout } from '../lib/types'

export function MeFeed({
  profile,
  workouts,
  meals,
  onRecordWorkout,
  onLogMeal,
  onChanged,
}: {
  profile: Profile
  workouts: Workout[]
  meals: Meal[]
  onRecordWorkout: () => void
  onLogMeal: () => void
  onChanged: () => void
}) {
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)

  const t = today()
  const week = weekDates(t)
  const daysElapsed = week.indexOf(t) + 1

  const workoutDays = new Set(workouts.filter((w) => week.includes(w.local_date)).map((w) => w.local_date))
  const kcalByDay = new Map<string, number>()
  for (const m of meals) kcalByDay.set(m.local_date, (kcalByDay.get(m.local_date) ?? 0) + m.calories)

  const todayMeals = meals.filter((m) => m.local_date === t)
  const todayKcal = kcalByDay.get(t) ?? 0
  const underDays = week.slice(0, daysElapsed).filter((d) => kcalByDay.has(d) && kcalByDay.get(d)! <= profile.calorie_target).length
  const macros = todayMeals.reduce(
    (a, m) => ({ p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g }),
    { p: 0, c: 0, f: 0 },
  )
  const over = todayKcal > profile.calorie_target
  const trainedToday = workoutDays.has(t)

  return (
    <div className="space-y-5 px-4 pt-2 pb-28">
      <div className="fade-up">
        <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">{prettyDate(t)}</p>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight">Summary</h1>
      </div>

      {/* Weekly rings */}
      <section className="fade-up rounded-3xl bg-card p-5">
        <div className="flex items-center gap-5">
          <Rings
            size={128}
            stroke={15}
            rings={[
              { value: workoutDays.size, max: profile.weekly_target, color: '#fa114f' },
              { value: todayKcal, max: profile.calorie_target, color: '#a6ff00' },
              { value: underDays, max: daysElapsed, color: '#00d8ff' },
            ]}
          />
          <div className="min-w-0 space-y-2.5">
            <Stat label="Workouts this week" color="text-move" value={`${workoutDays.size}/${profile.weekly_target}`} unit="" />
            <Stat
              label="Calories today"
              color={over ? 'text-move' : 'text-exercise'}
              value={`${todayKcal.toLocaleString()}/${profile.calorie_target.toLocaleString()}`}
              unit="kcal"
            />
            <Stat label="Days under target" color="text-stand" value={`${underDays}/${daysElapsed}`} unit="" />
          </div>
        </div>

        {/* Week strip */}
        <div className="mt-5 grid grid-cols-7 gap-1 border-t border-white/10 pt-4">
          {week.map((d, i) => {
            const isToday = d === t
            const future = parseISODate(d) > parseISODate(t)
            const kcal = kcalByDay.get(d)
            return (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <span className={`text-[12px] font-semibold ${isToday ? 'text-white' : 'text-muted'}`}>{WEEKDAY_LETTERS[i]}</span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    workoutDays.has(d) ? 'bg-move text-white' : future ? 'bg-card-2/40' : 'bg-card-2'
                  } ${isToday ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-card' : ''}`}
                >
                  {workoutDays.has(d) && <IconDumbbell size={15} strokeWidth={2.5} />}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    kcal === undefined ? 'bg-transparent' : kcal <= profile.calorie_target ? 'bg-stand' : 'bg-move'
                  }`}
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* Primary actions */}
      <section className="fade-up grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onRecordWorkout}
          className="flex flex-col items-start gap-6 rounded-3xl bg-primary p-4 text-left text-black shadow-[0_8px_30px_rgba(166,255,0,0.25)] active:scale-[0.98]"
        >
          <IconDumbbell size={28} strokeWidth={2.4} />
          <div>
            <div className="text-[17px] font-bold">Record Workout</div>
            <div className="text-[13px] opacity-70">{trainedToday ? 'Done today ✓ add another' : 'Log today’s session'}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onLogMeal}
          className="flex flex-col items-start gap-6 rounded-3xl bg-card p-4 text-left active:scale-[0.98]"
        >
          <IconFork size={28} className="text-exercise" />
          <div>
            <div className="text-[17px] font-bold">Log Meal</div>
            <div className="text-[13px] text-muted">Chat or snap a photo</div>
          </div>
        </button>
      </section>

      {/* Today's food */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[22px] font-bold">Today’s meals</h2>
          {todayMeals.length > 0 && (
            <span className="num text-[13px] text-muted">
              P {macros.p}g · C {macros.c}g · F {macros.f}g
            </span>
          )}
        </div>
        {todayMeals.length === 0 ? (
          <Empty text="Nothing logged yet today." />
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
            {todayMeals.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-card-2"
                  onClick={() => setSelectedMeal(m)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[16px]">{m.name}</div>
                    <div className="text-[13px] text-muted">
                      {new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[17px] font-semibold text-exercise">
                    {m.calories} <span className="text-[13px] font-normal text-muted">kcal</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent workouts */}
      <section>
        <h2 className="mb-2 text-[22px] font-bold">Recent workouts</h2>
        {workouts.length === 0 ? (
          <Empty text="No workouts yet. Your first one is a tap away." />
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
            {workouts.slice(0, 8).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-card-2"
                  onClick={() => setSelectedWorkout(w)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-move/15 text-move">
                    <IconDumbbell size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold">{w.day_name}</div>
                    <div className="truncate text-[13px] text-muted">
                      {w.local_date === t ? 'Today' : prettyDate(w.local_date)} · {w.exercises.filter((e) => e.done).length}{' '}
                      exercises
                    </div>
                  </div>
                  {w.duration_min != null && <span className="num shrink-0 text-[15px] text-stand">{w.duration_min} min</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Actions opened={!!selectedMeal} onBackdropClick={() => setSelectedMeal(null)}>
        <ActionsGroup>
          <ActionsLabel>
            {selectedMeal?.name} · {selectedMeal?.calories} kcal
            {selectedMeal && selectedMeal.items.length > 0 && (
              <span className="mt-1 block text-xs">{selectedMeal.items.map((i) => i.name).join(', ')}</span>
            )}
          </ActionsLabel>
          <ActionsButton
            className="text-move!"
            onClick={async () => {
              const m = selectedMeal
              setSelectedMeal(null)
              if (m) {
                await deleteMeal(m.id)
                onChanged()
              }
            }}
          >
            Delete meal
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton bold onClick={() => setSelectedMeal(null)}>
            Cancel
          </ActionsButton>
        </ActionsGroup>
      </Actions>

      <Actions opened={!!selectedWorkout} onBackdropClick={() => setSelectedWorkout(null)}>
        <ActionsGroup>
          <ActionsLabel>
            <span className="block font-semibold">{selectedWorkout?.day_name}</span>
            {selectedWorkout?.exercises
              .filter((e) => e.done)
              .map((e) => `${e.name} ${e.sets}×${e.reps}${e.weight_kg ? ` @ ${e.weight_kg}kg` : ''}`)
              .join(' · ')}
            {selectedWorkout?.notes && <span className="mt-1 block italic">“{selectedWorkout.notes}”</span>}
          </ActionsLabel>
          <ActionsButton
            className="text-move!"
            onClick={async () => {
              const w = selectedWorkout
              setSelectedWorkout(null)
              if (w) {
                await deleteWorkout(w.id)
                onChanged()
              }
            }}
          >
            Delete workout
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton bold onClick={() => setSelectedWorkout(null)}>
            Cancel
          </ActionsButton>
        </ActionsGroup>
      </Actions>
    </div>
  )
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-white/90">{label}</div>
      <div className={`num text-[22px] leading-tight font-bold ${color}`}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-semibold">{unit}</span>}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-card px-4 py-6 text-center text-[15px] text-muted">{text}</div>
}
