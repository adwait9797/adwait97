export type Goal = 'lose' | 'maintain' | 'gain'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  weight_kg: number | null
  height_cm: number | null
  goal: Goal
  weekly_target: number
  split: string
  calorie_target: number
  timezone: string
  onboarded: boolean
}

export interface PlanExercise {
  name: string
  sets: number
  reps: number
}

export interface PlanDay {
  id?: string
  position: number
  name: string
  exercises: PlanExercise[]
}

export interface WorkoutExercise extends PlanExercise {
  weight_kg: number | null
  done: boolean
}

export interface Workout {
  id: string
  local_date: string
  day_name: string
  exercises: WorkoutExercise[]
  duration_min: number | null
  notes: string | null
  created_at: string
}

export interface MealItem {
  name: string
  quantity: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface Meal {
  id: string
  local_date: string
  name: string
  items: MealItem[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  created_at: string
}

/** What /api/analyze-meal returns. */
export interface MealEstimate {
  is_food: boolean
  reply: string
  meal_name: string
  items: MealItem[]
  total: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  confidence: 'low' | 'medium' | 'high'
}

/** One row of get_feed(): aggregates only, never individual meals. */
export interface FeedEntry {
  user_id: string
  display_name: string
  avatar_url: string | null
  weekly_target: number
  local_date: string
  worked_out_today: boolean
  today_workout: string | null
  last_workout_at: string | null
  week_workouts: number
  week_workout_dates: string[]
  today_calories: number
  meals_today: number
  under_target_today: boolean
  week_under_target: number
}
