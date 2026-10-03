import { parseISODate, toISODate } from './dates'
import type { SetEntry, Workout, WorkoutExercise } from './types'

/** Every set of an exercise. Older/summary-only entries are expanded from sets × reps @ weight. */
export function setsOf(e: WorkoutExercise): SetEntry[] {
  if (e.set_log && e.set_log.length) return e.set_log
  if (!e.done) return []
  return Array.from({ length: e.sets }, () => ({ weight_kg: e.weight_kg, reps: e.reps }))
}

/** A quick log records only that you trained, with no exercise detail. */
export function isQuickLog(w: Workout): boolean {
  return w.exercises.length === 0
}

export function volume(sets: SetEntry[]): number {
  return sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * s.reps, 0)
}

/** Heaviest set; ties broken by reps. */
export function topSet(sets: SetEntry[]): SetEntry | null {
  let best: SetEntry | null = null
  for (const s of sets) {
    if (!best || (s.weight_kg ?? 0) > (best.weight_kg ?? 0) || ((s.weight_kg ?? 0) === (best.weight_kg ?? 0) && s.reps > best.reps)) {
      best = s
    }
  }
  return best
}

export function formatSet(s: SetEntry): string {
  return s.weight_kg ? `${fmtKg(s.weight_kg)} kg × ${s.reps}` : `${s.reps} reps`
}

export function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}

/** The most recent time an exercise was done (before `beforeDate`, if given). */
export function lastPerformance(
  workouts: Workout[],
  exercise: string,
  beforeDate?: string,
): { date: string; sets: SetEntry[] } | null {
  const sorted = [...workouts].sort((a, b) => b.local_date.localeCompare(a.local_date) || b.created_at.localeCompare(a.created_at))
  for (const w of sorted) {
    if (beforeDate && w.local_date >= beforeDate) continue
    const e = w.exercises.find((x) => x.name === exercise)
    const sets = e ? setsOf(e) : []
    if (sets.length) return { date: w.local_date, sets }
  }
  return null
}

export interface SessionPoint {
  date: string
  /** Top weight, or top reps for bodyweight exercises. */
  value: number
  top: SetEntry
  volume: number
}

export interface ExerciseProgress {
  name: string
  bodyweight: boolean
  sessions: SessionPoint[]
  latest: SessionPoint
  /** Session compared against: the latest one at least a week before `latest`, else the first one. */
  baseline: SessionPoint | null
  change: number
  changePct: number | null
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)
}

/** Per-exercise progress for one split day (e.g. "Push"), oldest session first. */
export function splitProgress(workouts: Workout[], dayName: string): ExerciseProgress[] {
  const sessions = workouts
    .filter((w) => w.day_name === dayName && !isQuickLog(w))
    .sort((a, b) => a.local_date.localeCompare(b.local_date) || a.created_at.localeCompare(b.created_at))

  const byExercise = new Map<string, SessionPoint[]>()
  for (const w of sessions) {
    for (const e of w.exercises) {
      const sets = setsOf(e)
      const top = topSet(sets)
      if (!top) continue
      const list = byExercise.get(e.name) ?? []
      list.push({ date: w.local_date, value: 0, top, volume: volume(sets) })
      byExercise.set(e.name, list)
    }
  }

  const result: ExerciseProgress[] = []
  for (const [name, points] of byExercise) {
    const bodyweight = points.every((p) => !p.top.weight_kg)
    for (const p of points) p.value = bodyweight ? p.top.reps : (p.top.weight_kg ?? 0)
    const latest = points[points.length - 1]
    let baseline: SessionPoint | null = null
    for (let i = points.length - 2; i >= 0; i--) {
      if (daysBetween(points[i].date, latest.date) >= 7) {
        baseline = points[i]
        break
      }
    }
    if (!baseline && points.length > 1) baseline = points[0]
    const change = baseline ? latest.value - baseline.value : 0
    const changePct = baseline && baseline.value > 0 ? (change / baseline.value) * 100 : null
    result.push({ name, bodyweight, sessions: points, latest, baseline, change, changePct })
  }
  return result
}

/** Total lifted volume (kg) between two dates, inclusive. */
export function volumeBetween(workouts: Workout[], from: string, to: string, dayName?: string): number {
  return workouts
    .filter((w) => w.local_date >= from && w.local_date <= to && (!dayName || w.day_name === dayName))
    .reduce((sum, w) => sum + w.exercises.reduce((s, e) => s + volume(setsOf(e)), 0), 0)
}

export function isoDaysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return toISODate(d)
}
