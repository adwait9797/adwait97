import { Dialog, DialogButton, Preloader } from 'konsta/react'
import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { IconDumbbell, IconFlame, IconTrophy } from '../components/icons'
import { Seg } from '../components/Seg'
import { StatusSheet } from '../components/StatusSheet'
import { tagsFor, type Tag } from '../lib/badges'
import { timeAgo, WEEKDAY_LETTERS, weekDates } from '../lib/dates'
import type { FeedEntry, FriendStats } from '../lib/types'

function score(e: FeedEntry) {
  return Math.min(e.week_workouts / Math.max(1, e.weekly_target), 1)
}

const MEDALS = ['#ffd60a', '#d1d1d6', '#ff9f0a']

/** Small ▲ 4% / ▼ 2% strength-trend pill. Arrow + sign carry the meaning, not just colour. */
function TrendPill({ pct, large }: { pct: number | null | undefined; large?: boolean }) {
  if (pct === null || pct === undefined) return null
  const up = pct > 0.05
  const down = pct < -0.05
  const cls = up ? 'bg-exercise/15 text-exercise' : down ? 'bg-move/15 text-move' : 'bg-white/10 text-muted'
  const text = up ? `▲ ${pct.toFixed(1)}%` : down ? `▼ ${Math.abs(pct).toFixed(1)}%` : '± 0%'
  return (
    <span className={`num inline-flex shrink-0 items-center rounded-full font-semibold ${cls} ${large ? 'px-2.5 py-1 text-[14px]' : 'px-1.5 py-0.5 text-[11px]'}`}>
      {text}
    </span>
  )
}

/** Little speech bubble shown above a profile picture. */
function StatusBubble({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2">
      <div className="w-max max-w-[80px] rounded-2xl bg-white px-2 py-1 text-center text-[11px] leading-tight font-semibold break-words text-black shadow-lg">
        {text}
      </div>
      <div className="mx-auto -mt-1 h-2 w-2 rotate-45 bg-white" />
    </div>
  )
}

function TagChip({ tag, onTap }: { tag: Tag; onTap: (t: Tag) => void }) {
  return (
    <button
      type="button"
      onClick={() => onTap(tag)}
      className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px] font-semibold text-white/90 active:bg-white/15"
    >
      <span aria-hidden>{tag.emoji}</span>
      {tag.label}
    </button>
  )
}

export function FriendsFeed({
  feed,
  stats,
  meId,
  loading,
  error,
  onStatusChanged,
}: {
  feed: FeedEntry[] | null
  stats: FriendStats[]
  meId: string
  loading: boolean
  error: string | null
  onStatusChanged: () => void
}) {
  const [board, setBoard] = useState<'workouts' | 'strength'>('workouts')
  const [statusOpen, setStatusOpen] = useState(false)
  const [openTag, setOpenTag] = useState<{ tag: Tag; who: string } | null>(null)

  if (!feed) {
    return (
      <div className="flex justify-center pt-24">
        {error ? <p className="px-8 text-center text-move">{error}</p> : <Preloader />}
      </div>
    )
  }

  const statsById = new Map(stats.map((s) => [s.user_id, s]))
  const pctOf = (id: string) => statsById.get(id)?.strength_pct ?? null
  const tagsById = new Map(feed.map((e) => [e.user_id, tagsFor(e, statsById.get(e.user_id), stats)]))
  const nameOf = (e: FeedEntry) => (e.user_id === meId ? 'You' : e.display_name)

  const me = feed.find((e) => e.user_id === meId)
  const anyStatus = feed.some((e) => e.status_text)
  const trainedToday = feed.filter((e) => e.worked_out_today)
  const ranked = [...feed].sort(
    (a, b) =>
      score(b) - score(a) ||
      b.week_workouts - a.week_workouts ||
      b.week_under_target - a.week_under_target ||
      a.display_name.localeCompare(b.display_name),
  )
  // Strength board: people with a trend first (highest gain first), then everyone else.
  const strengthRanked = [...feed].sort((a, b) => {
    const pa = pctOf(a.user_id)
    const pb = pctOf(b.user_id)
    if (pa === null && pb === null) return a.display_name.localeCompare(b.display_name)
    if (pa === null) return 1
    if (pb === null) return -1
    return pb - pa
  })
  // Status cards: who trained most recently first.
  const activity = [...feed].sort((a, b) => {
    if (a.worked_out_today !== b.worked_out_today) return a.worked_out_today ? -1 : 1
    return (b.last_workout_at ?? '').localeCompare(a.last_workout_at ?? '')
  })
  const list = board === 'workouts' ? ranked : strengthRanked

  return (
    <div className="space-y-6 pt-2 pb-28">
      <div className="fade-up flex items-end justify-between px-4">
        <div>
          <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">
            {trainedToday.length} of {feed.length} trained today
          </p>
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">Friends</h1>
        </div>
        <div className="mb-2 flex items-center gap-3">
          {loading && <Preloader className="h-5! w-5!" />}
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold active:bg-white/20"
          >
            💬 {me?.status_text ? 'Edit status' : 'Add status'}
          </button>
        </div>
      </div>

      {/* Stories-style row: green ring = already trained today */}
      <div className={`no-scrollbar flex gap-4 overflow-x-auto px-4 ${anyStatus ? 'pt-14' : ''}`}>
        {[...trainedToday, ...feed.filter((e) => !e.worked_out_today)].map((e) => (
          <div key={e.user_id} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              {e.status_text && <StatusBubble text={e.status_text} />}
              <div className={e.worked_out_today ? '' : 'opacity-45'}>
                <Avatar url={e.avatar_url} name={e.display_name} size={64} ring={e.worked_out_today} />
              </div>
            </div>
            <span className="w-full truncate text-center text-[12px]">{nameOf(e)}</span>
            <span className={`-mt-1 text-[11px] font-semibold ${e.worked_out_today ? 'text-exercise' : 'text-muted'}`}>
              {e.worked_out_today ? (e.today_workout ?? 'Trained') : 'Not yet'}
            </span>
          </div>
        ))}
      </div>

      {/* Leaderboards */}
      <section className="px-4">
        <div className="mb-3 flex items-center gap-2">
          <IconTrophy size={20} className="text-[#ffd60a]" />
          <h2 className="text-[22px] font-bold">Leaderboard</h2>
        </div>
        <div className="mb-3">
          <Seg
            value={board}
            onChange={setBoard}
            options={[
              { value: 'workouts', label: 'Workouts this week' },
              { value: 'strength', label: 'Strength gains' },
            ]}
          />
        </div>
        <ol className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
          {list.map((e, i) => {
            const pct = pctOf(e.user_id)
            const rankColor = board === 'strength' && pct === null ? '#8e8e93' : (MEDALS[i] ?? '#8e8e93')
            return (
              <li key={e.user_id} className={`flex items-center gap-3 px-4 py-3 ${e.user_id === meId ? 'bg-white/[0.04]' : ''}`}>
                <span className="num w-5 text-center text-[17px] font-bold" style={{ color: rankColor }}>
                  {board === 'strength' && pct === null ? '–' : i + 1}
                </span>
                <Avatar url={e.avatar_url} name={e.display_name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[16px] font-semibold">
                        {e.display_name}
                        {e.user_id === meId && <span className="ml-1 text-[13px] font-normal text-muted">(you)</span>}
                      </span>
                      {board === 'workouts' && <TrendPill pct={pct} />}
                    </span>
                    {board === 'workouts' ? (
                      <span className="num shrink-0 text-[15px] font-semibold text-move">
                        {e.week_workouts}/{e.weekly_target}
                      </span>
                    ) : pct === null ? (
                      <span className="shrink-0 text-[12px] text-muted">needs 2+ weeks of logged sets</span>
                    ) : (
                      <TrendPill pct={pct} large />
                    )}
                  </div>
                  {board === 'workouts' ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-move/20">
                      <div
                        className="h-full rounded-full bg-move transition-[width] duration-700"
                        style={{ width: `${Math.max(score(e) * 100, score(e) > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  ) : (
                    (tagsById.get(e.user_id)?.length ?? 0) > 0 && (
                      <div className="mt-0.5 truncate text-[12px] text-muted">
                        {tagsById
                          .get(e.user_id)!
                          .map((t) => `${t.emoji} ${t.label}`)
                          .join('  ·  ')}
                      </div>
                    )
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        {board === 'strength' && (
          <p className="mt-2 px-1 text-[12px] text-muted">
            Change in your best lifts (estimated 1-rep max) over the last 2 weeks vs the 4 weeks before. Uses workouts
            logged with Start workout.
          </p>
        )}
      </section>

      {/* Today's status cards */}
      <section className="space-y-3 px-4">
        <h2 className="text-[22px] font-bold">Today</h2>
        {activity.map((e) => (
          <FriendCard
            key={e.user_id}
            entry={e}
            isMe={e.user_id === meId}
            pct={pctOf(e.user_id)}
            tags={tagsById.get(e.user_id) ?? []}
            onTag={(tag) => setOpenTag({ tag, who: nameOf(e) })}
          />
        ))}
        <p className="pt-2 text-center text-xs text-muted">
          Friends only see totals: workouts, day type, strength trend and daily calories. Individual meals and sets stay
          private.
        </p>
      </section>

      <StatusSheet
        opened={statusOpen}
        current={me?.status_text ?? null}
        currentAt={me?.status_at ?? null}
        onClose={() => setStatusOpen(false)}
        onSaved={onStatusChanged}
      />

      <Dialog
        opened={!!openTag}
        onBackdropClick={() => setOpenTag(null)}
        title={openTag ? `${openTag.tag.emoji} ${openTag.tag.label}` : ''}
        content={openTag ? `${openTag.who === 'You' ? 'You earned this' : `${openTag.who} earned this`}. ${openTag.tag.how}` : ''}
        buttons={<DialogButton onClick={() => setOpenTag(null)}>Nice</DialogButton>}
      />
    </div>
  )
}

function FriendCard({
  entry: e,
  isMe,
  pct,
  tags,
  onTag,
}: {
  entry: FeedEntry
  isMe: boolean
  pct: number | null
  tags: Tag[]
  onTag: (t: Tag) => void
}) {
  const week = weekDates(e.local_date)
  const trained = new Set(e.week_workout_dates)
  return (
    <div className="fade-up rounded-2xl bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar url={e.avatar_url} name={e.display_name} size={46} ring={e.worked_out_today} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[17px] font-semibold">{isMe ? 'You' : e.display_name}</span>
            <TrendPill pct={pct} />
          </div>
          {e.status_text && <div className="truncate text-[14px] font-medium text-white/90">💬 “{e.status_text}”</div>}
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
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((t) => (
            <TagChip key={t.id} tag={t} onTap={onTag} />
          ))}
        </div>
      )}
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
