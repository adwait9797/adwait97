import { supabase } from './supabase'
import { resizeImage } from './image'
import type { FeedEntry, FriendStats, Meal, MealEstimate, PlanDay, Profile, Workout, WorkoutExercise } from './types'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Not signed in')
  return id
}

// --- Profile -----------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<Profile | null> {
  return check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()) as Profile | null
}

export async function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  const id = await uid()
  return check(
    await supabase
      .from('profiles')
      .upsert({ ...patch, id })
      .select()
      .single(),
  ) as Profile
}

export async function uploadAvatar(file: File): Promise<string> {
  const id = await uid()
  const blob = await resizeImage(file, 320, 0.85)
  const path = `${id}/avatar.jpg`
  check(await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }))
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

// --- Plan ----------------------------------------------------------------------

export async function fetchPlan(): Promise<PlanDay[]> {
  return check(
    await supabase.from('plan_days').select('id, position, name, exercises').order('position'),
  ) as PlanDay[]
}

export async function savePlan(days: PlanDay[]): Promise<void> {
  const id = await uid()
  check(await supabase.from('plan_days').delete().eq('user_id', id))
  if (days.length === 0) return
  check(
    await supabase.from('plan_days').insert(
      days.map((d, i) => ({ user_id: id, position: i, name: d.name.trim() || `Day ${i + 1}`, exercises: d.exercises })),
    ),
  )
}

// --- Workouts --------------------------------------------------------------------

/** Workouts with local_date in [fromDate, toDate] (toDate optional), newest first. */
export async function fetchWorkouts(fromDate: string, toDate?: string): Promise<Workout[]> {
  let q = supabase.from('workouts').select('*').gte('local_date', fromDate)
  if (toDate) q = q.lte('local_date', toDate)
  return check(await q.order('local_date', { ascending: false }).order('created_at', { ascending: false })) as Workout[]
}

export async function addWorkout(w: {
  local_date: string
  day_name: string
  exercises: WorkoutExercise[]
  duration_min: number | null
  notes: string | null
}): Promise<void> {
  const id = await uid()
  check(await supabase.from('workouts').insert({ ...w, user_id: id }))
}

export async function deleteWorkout(id: string): Promise<void> {
  check(await supabase.from('workouts').delete().eq('id', id))
}

// --- Meals -----------------------------------------------------------------------

/** Meals with local_date in [fromDate, toDate] (toDate optional), newest first. */
export async function fetchMeals(fromDate: string, toDate?: string): Promise<Meal[]> {
  let q = supabase.from('meals').select('*').gte('local_date', fromDate)
  if (toDate) q = q.lte('local_date', toDate)
  return check(await q.order('local_date', { ascending: false }).order('created_at', { ascending: false })) as Meal[]
}

export async function addMeal(m: Omit<Meal, 'id' | 'created_at'>): Promise<void> {
  const id = await uid()
  check(await supabase.from('meals').insert({ ...m, user_id: id }))
}

export async function deleteMeal(id: string): Promise<void> {
  check(await supabase.from('meals').delete().eq('id', id))
}

// --- Friends feed ------------------------------------------------------------------

export async function fetchFeed(): Promise<FeedEntry[]> {
  return check(await supabase.rpc('get_feed')) as FeedEntry[]
}

/** Strength trend and tag inputs. Optional: returns [] if the SQL function isn't installed yet. */
export async function fetchFriendStats(): Promise<FriendStats[]> {
  const { data, error } = await supabase.rpc('get_friend_stats')
  if (error) {
    console.warn('get_friend_stats unavailable:', error.message)
    return []
  }
  return (data as FriendStats[]).map((r) => ({ ...r, strength_pct: r.strength_pct === null ? null : Number(r.strength_pct), volume_7d: Number(r.volume_7d) }))
}

// --- AI meal analysis -----------------------------------------------------------------

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  /** base64 JPEG, user turns only */
  image?: string
}

export async function analyzeMeal(turns: ChatTurn[]): Promise<MealEstimate> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  const res = await fetch('/api/analyze-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ turns }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body as MealEstimate
}
