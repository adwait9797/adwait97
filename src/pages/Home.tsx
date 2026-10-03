import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LogMealSheet } from '../components/LogMealSheet'
import { ProfileSheet } from '../components/ProfileSheet'
import { RecordWorkoutSheet } from '../components/RecordWorkoutSheet'
import { fetchFeed, fetchMeals, fetchPlan, fetchWorkouts } from '../lib/api'
import { toISODate, weekDates } from '../lib/dates'
import type { FeedEntry, Meal, PlanDay, Profile, Workout } from '../lib/types'
import { FriendsFeed } from './FriendsFeed'
import { MeFeed } from './MeFeed'

type Tab = 'me' | 'friends'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

export function Home({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('me')
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [feed, setFeed] = useState<FeedEntry[] | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'workout' | 'meal' | 'profile' | null>(null)
  const pager = useRef<HTMLDivElement>(null)

  const loadMine = useCallback(async () => {
    const [p, w, m] = await Promise.all([fetchPlan(), fetchWorkouts(daysAgo(30)), fetchMeals(weekDates()[0])])
    setPlan(p)
    setWorkouts(w)
    setMeals(m)
  }, [])

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      setFeed(await fetchFeed())
      setFeedError(null)
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Could not load friends')
    } finally {
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMine().catch(console.error)
    loadFeed()
  }, [loadMine, loadFeed])

  // Refresh when the app comes back to the foreground, and every minute on the friends tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadMine().catch(console.error)
        loadFeed()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(() => tab === 'friends' && loadFeed(), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [tab, loadMine, loadFeed])

  // Swipeable pager: tabs scroll the snap container, and swiping updates the tab.
  function goTo(t: Tab) {
    setTab(t)
    const el = pager.current
    if (el) el.scrollTo({ left: t === 'me' ? 0 : el.clientWidth, behavior: 'smooth' })
    if (t === 'friends') loadFeed()
  }

  function onPagerScroll() {
    const el = pager.current
    if (!el) return
    const t: Tab = el.scrollLeft > el.clientWidth / 2 ? 'friends' : 'me'
    if (t !== tab) {
      setTab(t)
      if (t === 'friends') loadFeed()
    }
  }

  const refreshAll = () => {
    loadMine().catch(console.error)
    loadFeed()
  }

  // Next day in the plan rotation, based on the last logged workout.
  const lastPlanned = workouts.find((w) => plan.some((d) => d.name === w.day_name))
  const suggestedDay = plan.length
    ? lastPlanned
      ? plan[(plan.findIndex((d) => d.name === lastPlanned.day_name) + 1) % plan.length].name
      : plan[0].name
    : null

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Top tabs, Instagram style */}
      <header className="pt-safe sticky top-0 z-20 bg-black/80 backdrop-blur-xl">
        <div className="relative flex h-12 items-center justify-center px-4">
          <nav className="flex gap-7">
            {(['me', 'friends'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => goTo(t)}
                className={`relative pb-1 text-[17px] font-bold transition-colors ${tab === t ? 'text-white' : 'text-white/45'}`}
              >
                {t === 'me' ? 'For You' : 'Friends'}
                <span
                  className={`absolute inset-x-2 -bottom-0.5 h-[3px] rounded-full bg-white transition-opacity ${
                    tab === t ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            ))}
          </nav>
          <button
            type="button"
            aria-label="Profile"
            className="absolute right-4"
            onClick={() => setSheet('profile')}
          >
            <Avatar url={profile.avatar_url} name={profile.display_name} size={32} />
          </button>
        </div>
      </header>

      <div
        ref={pager}
        onScroll={onPagerScroll}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        <section className="h-full w-full shrink-0 snap-start overflow-y-auto">
          <MeFeed
            profile={profile}
            workouts={workouts}
            meals={meals}
            onRecordWorkout={() => setSheet('workout')}
            onLogMeal={() => setSheet('meal')}
            onChanged={refreshAll}
          />
        </section>
        <section className="h-full w-full shrink-0 snap-start overflow-y-auto">
          <FriendsFeed feed={feed} meId={profile.id} loading={feedLoading} error={feedError} />
        </section>
      </div>

      <RecordWorkoutSheet
        opened={sheet === 'workout'}
        plan={plan}
        suggestedDay={suggestedDay}
        onClose={() => setSheet(null)}
        onSaved={refreshAll}
      />
      <LogMealSheet opened={sheet === 'meal'} onClose={() => setSheet(null)} onSaved={refreshAll} />
      <ProfileSheet opened={sheet === 'profile'} onClose={() => setSheet(null)} onPlanChanged={setPlan} />
    </div>
  )
}
