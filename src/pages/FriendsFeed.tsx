import { Preloader } from 'konsta/react'
import { Avatar } from '../components/Avatar'
import { IconDumbbell, IconFlame, IconTrophy } from '../components/icons'
import { timeAgo, WEEKDAY_LETTERS, weekDates } from '../lib/dates'
import type { FeedEntry } from '../lib/types'

function score(e: FeedEntry) {
  return Math.min(e.week_workouts / Math.max(1, e.weekly_target), 1)
}

const MEDALS = ['#ffd60a', '#d1d1d6', '#ff9f0a']

export function FriendsFeed({
  feed,
  meId,
  loading,
  error,
}: {
  feed: FeedEntry[] | null
  meId: string
  loading: boolean
  error: string | null
}) {
  if (!feed) {
    return (
      <div className="flex justify-center pt-24">
        {error ? <p className="px-8 text-center text-move">{error}</p> : <Preloader />}
      </div>
    )
  }

  const trainedToday = feed.filter((e) => e.worked_out_today)
  const ranked = [...feed].sort(
    (a, b) =>
      score(b) - score(a) ||
      b.week_workouts - a.week_workouts ||
      b.week_under_target - a.week_under_target ||
      a.display_name.localeCompare(b.display_name),
  )
  // Status cards: who trained most recently first.
  const activity = [...feed].sort((a, b) => {
    if (a.worked_out_today !== b.worked_out_today) return a.worked_out_today ? -1 : 1
    return (b.last_workout_at ?? '').localeCompare(a.last_workout_at ?? '')
  })

  return (
    <div className="space-y-6 pt-2 pb-28">
      <div className="fade-up flex items-end justify-between px-4">
        <div>
          <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">
            {trainedToday.length} of {feed.length} trained today
          </p>
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">Friends</h1>
        </div>
        {loading && <Preloader className="mb-2 h-5! w-5!" />}
      </div>

      {/* Stories-style row: green ring = already trained today */}
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4">
        {[...trainedToday, ...feed.filter((e) => !e.worked_out_today)].map((e) => (
          <div key={e.user_id} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
            <div className={e.worked_out_today ? '' : 'opacity-45'}>
              <Avatar url={e.avatar_url} name={e.display_name} size={64} ring={e.worked_out_today} />
            </div>
            <span className="w-full truncate text-center text-[12px]">{e.user_id === meId ? 'You' : e.display_name}</span>
            <span className={`-mt-1 text-[11px] font-semibold ${e.worked_out_today ? 'text-exercise' : 'text-muted'}`}>
              {e.worked_out_today ? (e.today_workout ?? 'Trained') : 'Not yet'}
            </span>
          </div>
        ))}
      </div>

      {/* Weekly leaderboard */}
      <section className="px-4">
        <div className="mb-2 flex items-center gap-2">
          <IconTrophy size={20} className="text-[#ffd60a]" />
          <h2 className="text-[22px] font-bold">This week</h2>
        </div>
        <ol className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
          {ranked.map((e, i) => {
            const pct = score(e)
            return (
              <li key={e.user_id} className={`flex items-center gap-3 px-4 py-3 ${e.user_id === meId ? 'bg-white/[0.04]' : ''}`}>
                <span className="num w-5 text-center text-[17px] font-bold" style={{ color: MEDALS[i] ?? '#8e8e93' }}>
                  {i + 1}
                </span>
                <Avatar url={e.avatar_url} name={e.display_name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[16px] font-semibold">
                      {e.display_name}
                      {e.user_id === meId && <span className="ml-1 text-[13px] font-normal text-muted">(you)</span>}
                    </span>
                    <span className="num shrink-0 text-[15px] font-semibold text-move">
                      {e.week_workouts}/{e.weekly_target}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-move/20">
                    <div
                      className="h-full rounded-full bg-move transition-[width] duration-700"
                      style={{ width: `${Math.max(pct * 100, pct > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Today's status cards */}
      <section className="space-y-3 px-4">
        <h2 className="text-[22px] font-bold">Today</h2>
        {activity.map((e) => (
          <FriendCard key={e.user_id} entry={e} isMe={e.user_id === meId} />
        ))}
        <p className="pt-2 text-center text-xs text-muted">
          Friends only see totals: workouts, day type and daily calories. Individual meals stay private.
        </p>
      </section>
    </div>
  )
}

function FriendCard({ entry: e, isMe }: { entry: FeedEntry; isMe: boolean }) {
  const week = weekDates(e.local_date)
  const trained = new Set(e.week_workout_dates)
  return (
    <div className="fade-up rounded-2xl bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar url={e.avatar_url} name={e.display_name} size={46} ring={e.worked_out_today} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold">{isMe ? 'You' : e.display_name}</div>
          {e.worked_out_today ? (
            <div className="flex items-center gap-1 text-[14px] font-semibold text-exercise">
              <IconDumbbell size={15} strokeWidth={2.5} /> {e.today_workout} day
              {e.last_workout_at && <span className="font-normal text-muted">· {timeAgo(e.last_workout_at)}</span>}
            </div>
          ) : (
            <div className="text-[14px] text-muted">
              No workout yet today
              {e.last_workout_at && <> · last {timeAgo(e.last_workout_at)}</>}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className={`num flex items-center justify-end gap-1 text-[20px] font-bold ${e.under_target_today ? 'text-stand' : 'text-move'}`}>
            <IconFlame size={16} />
            {e.today_calories.toLocaleString()}
          </div>
          <div className="text-[12px] text-muted">
            kcal · {e.meals_today} meal{e.meals_today === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {week.map((d, i) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full ${trained.has(d) ? 'bg-move' : d > e.local_date ? 'bg-card-2/40' : 'bg-card-2'}`} />
            <span className={`text-[10px] ${d === e.local_date ? 'font-bold text-white' : 'text-muted'}`}>{WEEKDAY_LETTERS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
