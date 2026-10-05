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
  /** Banter status (max 20 characters), visible to friends for 24 hours after status_at. */
  status_text?: string | null
  status_at?: string | null
  /** Admins can create groups (set from the Supabase dashboard only). */
  is_admin?: boolean
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

/**
 * One logged set during a live workout. weight_kg is null for bodyweight exercises.
 * Cardio machines log minutes / distance_km instead, with reps = 0.
 */
export interface SetEntry {
  weight_kg: number | null
  reps: number
  minutes?: number | null
  distance_km?: number | null
}

/**
 * Stored in workouts.exercises (jsonb). Live workouts also store every set in set_log;
 * sets/reps/weight_kg are kept as a summary (set count, last reps, top weight).
 */
export interface WorkoutExercise extends PlanExercise {
  weight_kg: number | null
  done: boolean
  set_log?: SetEntry[]
  /** Older standalone cardio logs (run / cycle / steps) store one entry with sets = 0 and this filled in. */
  cardio?: CardioEntry
}

export type CardioKind = 'run' | 'cycle' | 'walk'

export interface CardioEntry {
  kind: CardioKind
  distance_km: number | null
  steps: number | null
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
  /** Only present while the status is less than 24 hours old. */
  status_text?: string | null
  status_at?: string | null
  /** Groups shared with the viewer. */
  group_ids?: string[]
  /** Accepted friend of the viewer. */
  is_friend?: boolean
}

/** One row of get_friend_stats(): aggregates behind the strength trend and fun tags. */
export interface FriendStats {
  user_id: string
  /** Median % change in best estimated 1RM, last 14 days vs the 28 days before. null = not enough data. */
  strength_pct: number | null
  compared_exercises: number
  prs_14d: number
  top_exercise: string | null
  top_exercise_sessions: number
  top_split: string | null
  top_split_sessions: number
  early_sessions: number
  late_sessions: number
  leg_weeks: number
  volume_7d: number
}

export interface Group {
  id: string
  name: string
  member_count: number
  is_member: boolean
  /** You asked to join and are waiting for an admin. */
  requested?: boolean
}

/** Admin overview row (admin_users()). */
export interface AdminUser {
  user_id: string
  display_name: string
  avatar_url: string | null
  email: string
  joined_at: string
  group_ids: string[]
  requested_group_ids: string[]
  requested_at: string | null
}

export type Relation = 'none' | 'requested' | 'incoming' | 'friends'

export interface UserSearchResult {
  user_id: string
  display_name: string
  avatar_url: string | null
  relation: Relation
}

export interface Friendship {
  user_id: string
  display_name: string
  avatar_url: string | null
  status: 'pending' | 'accepted'
  /** true = they sent the request to you */
  incoming: boolean
  created_at: string
}
