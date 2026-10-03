import type { FeedEntry, FriendStats } from './types'
import { CARDIO_DAYS } from './workoutStats'

export interface Tag {
  id: string
  emoji: string
  label: string
  /** How it's earned, shown when the tag is tapped. */
  how: string
}

/** "Barbell Bench Press" -> "Bench Press", "Romanian Deadlift" -> "RDL". Keeps tags short. */
export function shortExercise(name: string): string {
  const special: Record<string, string> = {
    'Barbell Bench Press': 'Bench Press',
    'Romanian Deadlift': 'RDL',
    'Overhead Press': 'Overhead Press',
    'Back Squat': 'Squat',
    'Bulgarian Split Squat': 'Split Squat',
    'Overhead Triceps Extension': 'Triceps',
  }
  if (special[name]) return special[name]
  const cleaned = name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^(Barbell|Dumbbell|Machine|Cable|Seated|Standing|Lying)\s+/i, '').trim()
  const words = cleaned.split(/\s+/)
  return words.length > 2 ? words.slice(-2).join(' ') : cleaned
}

/** "Upper A" -> "Upper", "Full Body B" -> "Full Body", "Chest & Back" stays. */
function shortSplit(name: string): string {
  const base = name.replace(/\s+[A-D]$/i, '').trim()
  return /^legs$/i.test(base) ? 'Leg' : base
}

/** Fun, earned titles. Relative ones (Most Improved, Volume Monster) compare against the whole group. */
export function tagsFor(entry: FeedEntry, stats: FriendStats | undefined, all: FriendStats[]): Tag[] {
  const tags: Tag[] = []
  if (!stats) return tags

  const withTrend = all.filter((s) => s.strength_pct !== null)
  const bestPct = Math.max(...withTrend.map((s) => s.strength_pct as number))
  if (withTrend.length >= 2 && stats.strength_pct !== null && stats.strength_pct > 0 && stats.strength_pct === bestPct) {
    tags.push({ id: 'improved', emoji: '🏆', label: 'Most Improved', how: 'Biggest strength gain in the group over the last 2 weeks.' })
  }

  if (stats.prs_14d >= 3) {
    tags.push({ id: 'pr', emoji: '🔥', label: 'PR Machine', how: 'Set personal bests on 3+ exercises in the last 14 days.' })
  }

  if (stats.top_exercise && stats.top_exercise_sessions >= 3) {
    tags.push({
      id: 'specialist',
      emoji: '💪',
      label: `${shortExercise(stats.top_exercise)} Specialist`,
      how: `${stats.top_exercise} is their most-trained exercise (${stats.top_exercise_sessions} sessions in 8 weeks).`,
    })
  }

  if (stats.top_split && stats.top_split_sessions >= 3 && !CARDIO_DAYS.has(stats.top_split)) {
    tags.push({
      id: 'split',
      emoji: '⚡',
      label: `${shortSplit(stats.top_split)} Day Hacker`,
      how: `${stats.top_split} is their favourite day (${stats.top_split_sessions} sessions in 8 weeks).`,
    })
  } else if (stats.top_split && CARDIO_DAYS.has(stats.top_split) && stats.top_split_sessions >= 3) {
    tags.push({ id: 'cardio', emoji: '🏃', label: 'Cardio Bunny', how: 'Cardio is their most-logged day (3+ sessions in 8 weeks).' })
  }

  if (stats.leg_weeks >= 4) {
    tags.push({ id: 'legs', emoji: '🦵', label: 'Never Skips Leg Day', how: 'Trained legs every week for the last 4 weeks.' })
  }

  const topVolume = Math.max(...all.map((s) => s.volume_7d))
  if (all.length >= 2 && stats.volume_7d > 0 && stats.volume_7d === topVolume) {
    tags.push({ id: 'volume', emoji: '🏋️', label: 'Volume Monster', how: 'Lifted the most total weight in the group this week.' })
  }

  if (stats.early_sessions >= 3 && stats.early_sessions >= stats.late_sessions) {
    tags.push({ id: 'early', emoji: '🌅', label: 'Early Bird', how: 'Started 3+ workouts before 8am in the last 4 weeks.' })
  } else if (stats.late_sessions >= 3) {
    tags.push({ id: 'late', emoji: '🦉', label: 'Night Owl', how: 'Started 3+ workouts after 9pm in the last 4 weeks.' })
  }

  if (entry.week_under_target >= 5) {
    tags.push({ id: 'calories', emoji: '🎯', label: 'Calorie Sniper', how: 'Stayed under their calorie target on 5+ days this week.' })
  }

  return tags
}
