import { Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useCallback, useEffect, useState } from 'react'
import { fetchMeals, fetchWorkouts } from '../lib/api'
import { prettyDate, today } from '../lib/dates'
import type { Meal, Workout } from '../lib/types'
import { cardioOf, isoDaysAgo, isQuickLog, workoutSummary } from '../lib/workoutStats'
import { IconDumbbell } from './icons'

const PAGE_DAYS = 30

interface Day {
  date: string
  meals: Meal[]
  workouts: Workout[]
  kcal: number
}

function groupByDay(meals: Meal[], workouts: Workout[]): Day[] {
  const map = new Map<string, Day>()
  const get = (date: string) => {
    let d = map.get(date)
    if (!d) map.set(date, (d = { date, meals: [], workouts: [], kcal: 0 }))
    return d
  }
  for (const m of meals) {
    const d = get(m.local_date)
    d.meals.push(m)
    d.kcal += m.calories
  }
  for (const w of workouts) get(w.local_date).workouts.push(w)
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** Every past day with its meals and workouts, loaded 30 days at a time. */
export function HistorySheet({
  opened,
  calorieTarget,
  version,
  onClose,
  onOpenMeal,
  onOpenWorkout,
}: {
  opened: boolean
  calorieTarget: number
  /** Bumped by the parent when data changes (e.g. a delete), to refetch. */
  version: number
  onClose: () => void
  onOpenMeal: (m: Meal) => void
  onOpenWorkout: (w: Workout) => void
}) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (n: number) => {
    setLoading(true)
    try {
      const from = isoDaysAgo(n * PAGE_DAYS - 1)
      const [m, w] = await Promise.all([fetchMeals(from, today()), fetchWorkouts(from, today())])
      setMeals(m)
      setWorkouts(w)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (opened) load(pages)
  }, [opened, pages, version, load])

  const days = groupByDay(meals, workouts)

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar title="History" right={<Link onClick={onClose}>Done</Link>} />
        <div className="space-y-4 px-4 py-4 pb-16">
          {error && <p className="text-center text-sm text-move">{error}</p>}
          {!loading && days.length === 0 && !error && (
            <p className="pt-10 text-center text-muted">Nothing logged in the last {pages * PAGE_DAYS} days.</p>
          )}
          {days.map((d) => {
            const over = d.kcal > calorieTarget
            return (
              <section key={d.date} className="rounded-2xl bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[17px] font-bold">{d.date === today() ? 'Today' : prettyDate(d.date)}</h3>
                  {d.meals.length > 0 && (
                    <span className={`num text-[15px] font-semibold ${over ? 'text-move' : 'text-stand'}`}>
                      {d.kcal.toLocaleString()} <span className="text-[12px] font-normal text-muted">/ {calorieTarget.toLocaleString()} kcal</span>
                    </span>
                  )}
                </div>

                {d.workouts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.workouts.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onOpenWorkout(w)}
                        className="flex items-center gap-1.5 rounded-full bg-move/15 px-3 py-1.5 text-[14px] font-semibold text-move active:bg-move/25"
                      >
                        <IconDumbbell size={15} strokeWidth={2.5} /> {w.day_name}
                        <span className="font-normal text-white/60">
                          {cardioOf(w)
                            ? workoutSummary(w)
                            : isQuickLog(w)
                              ? 'quick log'
                              : `${w.exercises.length} ex${w.duration_min ? ` · ${w.duration_min}m` : ''}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {d.meals.length > 0 && (
                  <ul className="mt-2 divide-y divide-white/10">
                    {d.meals.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => onOpenMeal(m)}
                          className="flex w-full items-center justify-between gap-3 py-2.5 text-left active:opacity-60"
                        >
                          <span className="min-w-0 truncate text-[15px]">{m.name}</span>
                          <span className="num shrink-0 text-[15px] text-muted">{m.calories} kcal</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}

          {loading ? (
            <div className="flex justify-center py-4">
              <Preloader />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPages(pages + 1)}
              className="w-full rounded-2xl bg-card py-3.5 text-[16px] font-medium text-primary active:bg-card-2"
            >
              Load earlier
            </button>
          )}
        </div>
      </Page>
    </Popup>
  )
}
