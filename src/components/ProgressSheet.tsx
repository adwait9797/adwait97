import { Link, Navbar, Page, Popup } from 'konsta/react'
import { useMemo, useState } from 'react'
import { parseISODate, today } from '../lib/dates'
import type { PlanDay, Workout } from '../lib/types'
import {
  cardioOf,
  fmtKm,
  isCardioSet,
  setsOf,
  fmtKg,
  formatSet,
  isoDaysAgo,
  isQuickLog,
  splitProgress,
  volumeBetween,
  type ExerciseProgress,
  type SessionPoint,
} from '../lib/workoutStats'
import { IconTrophy } from './icons'

const LINE = '#00d8ff'

function shortDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Single-series trend of the top set per session. One hue, end point marked and labelled. */
function Sparkline({ points, unit }: { points: SessionPoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 300
  const H = 56
  const PAD = 6
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1))
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const active = hover ?? points.length - 1
  const ap = points[active]

  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-14 w-full touch-none overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Top set per session: ${points.map((p) => `${shortDate(p.date)} ${fmtKg(p.value)} ${unit}`).join(', ')}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const rel = ((e.clientX - r.left) / r.width) * W
          let best = 0
          points.forEach((_, i) => {
            if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i
          })
          setHover(best)
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="white" strokeOpacity={0.12} vectorEffect="non-scaling-stroke" />
        {points.length > 1 && <path d={area} fill={LINE} fillOpacity={0.12} />}
        {points.length > 1 && (
          <path d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {hover !== null && (
          <line x1={x(active)} x2={x(active)} y1={0} y2={H} stroke="white" strokeOpacity={0.3} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Marker drawn in HTML so it stays round despite the stretched SVG. */}
      <span
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(ap.value) / H) * 56}px`, background: LINE }}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{shortDate(points[0].date)}</span>
        <span className="num text-white/80">
          {shortDate(ap.date)} · {formatSet(ap.top)}
        </span>
      </div>
    </div>
  )
}

function ChangeBadge({ p }: { p: ExerciseProgress }) {
  if (!p.baseline) return <span className="text-[12px] text-muted">1 session</span>
  const unit = p.bodyweight ? ' reps' : ' kg'
  const up = p.change > 0
  const flat = p.change === 0
  return (
    <div className="text-right">
      <div className={`num text-[15px] font-bold ${flat ? 'text-muted' : up ? 'text-exercise' : 'text-move'}`}>
        {flat ? '±0' : `${up ? '▲ +' : '▼ '}${fmtKg(p.change)}${unit}`}
        {p.changePct !== null && !flat && <span className="ml-1 text-[12px] font-semibold">({up ? '+' : ''}{Math.round(p.changePct)}%)</span>}
      </div>
      <div className="text-[11px] text-muted">vs {shortDate(p.baseline.date)}</div>
    </div>
  )
}

function pctChange(now: number, before: number): string | null {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}

/** Cardio since `from`: cardio exercises logged in workouts, plus older standalone run / cycle / steps logs. */
function cardioTotals(workouts: Workout[], from: string) {
  const t = { sessions: 0, minutes: 0, km: 0, steps: 0 }
  for (const w of workouts) {
    if (w.local_date < from) continue
    const old = cardioOf(w)
    if (old) {
      t.sessions++
      t.minutes += w.duration_min ?? 0
      t.km += old.distance_km ?? 0
      t.steps += old.steps ?? 0
      continue
    }
    const sets = w.exercises.flatMap((e) => setsOf(e).filter(isCardioSet))
    if (!sets.length) continue
    t.sessions++
    for (const x of sets) {
      t.minutes += x.minutes ?? 0
      t.km += x.distance_km ?? 0
    }
  }
  return t
}

/** Split-by-split strength progress, from workouts logged with "Start workout". */
export function ProgressSheet({
  opened,
  plan,
  workouts,
  onClose,
}: {
  opened: boolean
  plan: PlanDay[]
  /** At least the last ~8 weeks. */
  workouts: Workout[]
  onClose: () => void
}) {
  const detailed = workouts.filter((w) => !isQuickLog(w) && !cardioOf(w))
  const cardioWeek = cardioTotals(workouts, isoDaysAgo(6))
  const splits = useMemo(() => {
    const names = plan.map((d) => d.name)
    for (const w of detailed) if (!names.includes(w.day_name)) names.push(w.day_name)
    return names
  }, [plan, detailed])
  const latestSplit = [...detailed].sort((a, b) => b.local_date.localeCompare(a.local_date))[0]?.day_name
  const [picked, setPicked] = useState<string | null>(null)
  const split = picked && splits.includes(picked) ? picked : (latestSplit ?? splits[0] ?? '')

  const t = today()
  const weekAgo = isoDaysAgo(6)
  const prevFrom = isoDaysAgo(13)
  const prevTo = isoDaysAgo(7)
  const volNow = volumeBetween(workouts, weekAgo, t)
  const volPrev = volumeBetween(workouts, prevFrom, prevTo)
  const sessionsNow = workouts.filter((w) => w.local_date >= weekAgo).length

  const progress = splitProgress(workouts, split)
  const planned = plan.find((d) => d.name === split)?.exercises.map((e) => e.name) ?? []
  // Plan order first, then anything else done on this split.
  const ordered = [
    ...planned.map((n) => progress.find((p) => p.name === n) ?? n),
    ...progress.filter((p) => !planned.includes(p.name)),
  ]
  const splitSessions = detailed.filter((w) => w.day_name === split).length
  const splitVolNow = volumeBetween(workouts, weekAgo, t, split)
  const splitVolPrev = volumeBetween(workouts, prevFrom, prevTo, split)
  const best = progress.filter((p) => p.changePct !== null && p.change > 0).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))[0]
  const quickLogs = workouts.filter((w) => isQuickLog(w) && w.day_name === split).length

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar title="Gym Progress" right={<Link onClick={onClose}>Done</Link>} />
        <div className="space-y-5 px-4 py-4 pb-16">
          {/* Last 7 days, all splits */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-4">
              <div className="text-[13px] text-muted">Workouts, last 7 days</div>
              <div className="num text-[30px] font-bold text-move">{sessionsNow}</div>
            </div>
            <div className="rounded-2xl bg-card p-4">
              <div className="text-[13px] text-muted">Volume, last 7 days</div>
              <div className="num text-[30px] leading-tight font-bold text-stand">
                {volNow >= 1000 ? `${(volNow / 1000).toFixed(1)}t` : `${Math.round(volNow)}kg`}
              </div>
              {pctChange(volNow, volPrev) && <div className="text-[12px] text-muted">{pctChange(volNow, volPrev)} vs week before</div>}
            </div>
          </section>

          {cardioWeek.sessions > 0 && (
            <section className="rounded-2xl bg-card p-4">
              <div className="text-[13px] text-muted">Cardio, last 7 days</div>
              <div className="num mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                {cardioWeek.minutes > 0 && (
                  <span className="text-[26px] font-bold text-exercise">
                    {Math.round(cardioWeek.minutes)}
                    <span className="ml-1 text-[13px] font-semibold">min</span>
                  </span>
                )}
                {cardioWeek.km > 0 && (
                  <span className="text-[26px] font-bold text-stand">
                    {fmtKm(cardioWeek.km)}
                    <span className="ml-1 text-[13px] font-semibold">km</span>
                  </span>
                )}
                {cardioWeek.steps > 0 && (
                  <span className="text-[26px] font-bold text-move">
                    {cardioWeek.steps.toLocaleString()}
                    <span className="ml-1 text-[13px] font-semibold">steps</span>
                  </span>
                )}
                <span className="text-[13px] text-muted">
                  in {cardioWeek.sessions} workout{cardioWeek.sessions === 1 ? '' : 's'}
                </span>
              </div>
            </section>
          )}

          {splits.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {splits.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPicked(n)}
                    className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold ${n === split ? 'bg-white text-black' : 'bg-card text-white'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <section className="rounded-2xl bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[22px] font-bold">{split}</h2>
                  <span className="text-[13px] text-muted">
                    {splitSessions} session{splitSessions === 1 ? '' : 's'} in 8 weeks
                  </span>
                </div>
                <div className="mt-1 text-[14px] text-muted">
                  Volume this week <span className="num font-semibold text-white">{Math.round(splitVolNow).toLocaleString()} kg</span>
                  {pctChange(splitVolNow, splitVolPrev) && <> ({pctChange(splitVolNow, splitVolPrev)} vs last week)</>}
                </div>
                {best && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#ffd60a]/10 px-3 py-2 text-[14px]">
                    <IconTrophy size={18} className="shrink-0 text-[#ffd60a]" />
                    <span>
                      Biggest gain: <b>{best.name}</b> +{Math.round(best.changePct ?? 0)}%
                    </span>
                  </div>
                )}
              </section>

              {progress.length === 0 && (
                <p className="rounded-2xl bg-card px-4 py-5 text-center text-[15px] text-muted">
                  No detailed {split} sessions yet. Use <b className="text-white">Start workout</b> and log your sets to see progress here.
                </p>
              )}

              <div className="space-y-3">
                {ordered.map((p) =>
                  typeof p === 'string' ? (
                    progress.length > 0 && (
                      <div key={p} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 text-muted">
                        <span className="text-[16px]">{p}</span>
                        <span className="text-[12px]">no data yet</span>
                      </div>
                    )
                  ) : (
                    <section key={p.name} className="rounded-2xl bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[17px] font-semibold">{p.name}</h3>
                          <div className="num text-[14px] text-muted">
                            Top set <span className="font-semibold text-white">{formatSet(p.latest.top)}</span>
                          </div>
                        </div>
                        <ChangeBadge p={p} />
                      </div>
                      <Sparkline points={p.sessions} unit={p.bodyweight ? 'reps' : 'kg'} />
                    </section>
                  ),
                )}
              </div>

              {quickLogs > 0 && (
                <p className="text-center text-xs text-muted">
                  {quickLogs} quick-logged {split} session{quickLogs === 1 ? '' : 's'} not included (no set details).
                </p>
              )}
            </>
          )}
        </div>
      </Page>
    </Popup>
  )
}

function Empty() {
  return (
    <div className="rounded-2xl bg-card px-6 py-10 text-center">
      <IconTrophy size={36} className="mx-auto text-[#ffd60a]" />
      <h2 className="mt-3 text-[20px] font-bold">No progress yet</h2>
      <p className="mt-1 text-[15px] text-muted">
        Tap Record Workout → <b className="text-white">Start workout</b> and log weights and reps. Your growth per exercise shows
        up here from the second session.
      </p>
    </div>
  )
}
