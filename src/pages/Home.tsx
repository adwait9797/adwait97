import { Actions, ActionsButton, ActionsGroup, ActionsLabel } from 'konsta/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { MealDetailSheet, WorkoutDetailSheet } from '../components/DetailSheets'
import { HistorySheet } from '../components/HistorySheet'
import { LiveWorkout, loadDraft, startDraft, type LiveDraft } from '../components/LiveWorkout'
import { LogMealSheet } from '../components/LogMealSheet'
import { ProfileSheet } from '../components/ProfileSheet'
import { ProgressSheet } from '../components/ProgressSheet'
import { QuickLogSheet } from '../components/QuickLogSheet'
import { fetchFeed, fetchFriendStats, fetchMeals, fetchPlan, fetchWorkouts } from '../lib/api'
import { toISODate, weekDates } from '../lib/dates'
import type { FeedEntry, FriendStats, Meal, PlanDay, Profile, Workout } from '../lib/types'
import { FriendsFeed } from './FriendsFeed'
import { MeFeed } from './MeFeed'

type Tab = 'me' | 'friends'
type SheetName = 'chooser' | 'quick' | 'meal' | 'profile' | 'history' | 'progress'

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
  const [friendStats, setFriendStats] = useState<FriendStats[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [mealDetail, setMealDetail] = useState<Meal | null>(null)
  const [workoutDetail, setWorkoutDetail] = useState<Workout | null>(null)
  // In-progress live workout (persisted in localStorage) and whether its screen is showing.
  const [liveDraft, setLiveDraft] = useState<LiveDraft | null>(() => loadDraft())
  const [liveOpen, setLiveOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const pager = useRef<HTMLDivElement>(null)

  const loadMine = useCallback(async () => {
    // 8 weeks of workouts feed the progress charts and "last time" hints.
    const [p, w, m] = await Promise.all([fetchPlan(), fetchWorkouts(daysAgo(56)), fetchMeals(weekDates()[0])])
    setPlan(p)
    setWorkouts(w)
    setMeals(m)
  }, [])

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const [f, st] = await Promise.all([fetchFeed(), fetchFriendStats()])
      setFeed(f)
      setFriendStats(st)
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
    setVersion((v) => v + 1)
  }

  // Next day in the plan rotation, based on the last logged workout.
  const lastPlanned = workouts.find((w) => plan.some((d) => d.name === w.day_name))
  const suggestedDay = plan.length
    ? lastPlanned
      ? plan[(plan.findIndex((d) => d.name === lastPlanned.day_name) + 1) % plan.length].name
      : plan[0].name
    : null

  function startLive() {
    setSheet(null)
    const existing = loadDraft()
    setLiveDraft(existing ?? startDraft(suggestedDay ?? 'Other', plan, workouts))
    setLiveOpen(true)
  }

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
          <button type="button" aria-label="Profile" className="absolute right-4" onClick={() => setSheet('profile')}>
            <Avatar url={profile.avatar_url} name={profile.display_name} size={32} />
          </button>
        </div>
      </header>

      <div ref={pager} onScroll={onPagerScroll} className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        <section className="h-full w-full shrink-0 snap-start overflow-y-auto">
          <MeFeed
            profile={profile}
            workouts={workouts}
            meals={meals}
            liveDraft={liveDraft}
            onRecordWorkout={() => (liveDraft ? setLiveOpen(true) : setSheet('chooser'))}
            onResumeWorkout={() => setLiveOpen(true)}
            onLogMeal={() => setSheet('meal')}
            onProgress={() => setSheet('progress')}
            onHistory={() => setSheet('history')}
            onOpenMeal={setMealDetail}
            onOpenWorkout={setWorkoutDetail}
          />
        </section>
        <section className="h-full w-full shrink-0 snap-start overflow-y-auto">
          <FriendsFeed feed={feed} stats={friendStats} meId={profile.id} loading={feedLoading} error={feedError} />
        </section>
      </div>

      <Actions opened={sheet === 'chooser'} onBackdropClick={() => setSheet(null)}>
        <ActionsGroup>
          <ActionsLabel>Record a workout</ActionsLabel>
          <ActionsButton bold onClick={startLive}>
            Start workout{suggestedDay ? ` · ${suggestedDay}` : ''}
            <span className="ml-2 text-[13px] font-normal text-muted">log sets live</span>
          </ActionsButton>
          <ActionsButton onClick={() => setSheet('quick')}>
            Quick log<span className="ml-2 text-[13px] text-muted">just the split</span>
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton onClick={() => setSheet(null)}>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      <QuickLogSheet
        opened={sheet === 'quick'}
        plan={plan}
        suggestedDay={suggestedDay}
        onClose={() => setSheet(null)}
        onSaved={refreshAll}
      />
      <LiveWorkout
        draft={liveOpen ? liveDraft : null}
        plan={plan}
        history={workouts}
        onMinimize={() => {
          setLiveDraft(loadDraft())
          setLiveOpen(false)
        }}
        onFinished={(saved) => {
          setLiveOpen(false)
          setLiveDraft(null)
          if (saved) refreshAll()
        }}
      />
      <LogMealSheet opened={sheet === 'meal'} onClose={() => setSheet(null)} onSaved={refreshAll} />
      <ProgressSheet opened={sheet === 'progress'} plan={plan} workouts={workouts} onClose={() => setSheet(null)} />
      <HistorySheet
        opened={sheet === 'history'}
        calorieTarget={profile.calorie_target}
        version={version}
        onClose={() => setSheet(null)}
        onOpenMeal={setMealDetail}
        onOpenWorkout={setWorkoutDetail}
      />
      <ProfileSheet opened={sheet === 'profile'} onClose={() => setSheet(null)} onPlanChanged={setPlan} />
      {/* Last, so they stack above History. */}
      <MealDetailSheet meal={mealDetail} onClose={() => setMealDetail(null)} onDeleted={refreshAll} />
      <WorkoutDetailSheet workout={workoutDetail} onClose={() => setWorkoutDetail(null)} onDeleted={refreshAll} />
    </div>
  )
}
