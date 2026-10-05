import { Dialog, DialogButton, Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useEffect, useState } from 'react'
import { addWorkout } from '../lib/api'
import { timeAgo, toISODate } from '../lib/dates'
import type { PlanDay, SetEntry, Workout, WorkoutExercise } from '../lib/types'
import { isCardioExercise } from '../lib/exercises'
import { formatSet, isCardioSet, lastPerformance, lastSession, setsOf } from '../lib/workoutStats'
import { ExercisePicker } from './ExercisePicker'
import { IconCheck, IconClose, IconPlus } from './icons'
import { DayChips, dayOptions } from './QuickLogSheet'

/** For cardio exercises, `weight` holds the distance in km and `reps` the minutes. */
interface DraftSet {
  weight: string
  reps: string
  done: boolean
}

interface DraftExercise {
  name: string
  sets: DraftSet[]
  /** Treadmill, bike, rower…: logged as minutes + km instead of kg × reps. */
  cardio?: boolean
}

export interface LiveDraft {
  startedAt: number
  dayName: string
  exercises: DraftExercise[]
  notes: string
  /** Workout id whose exercises were copied in with "Copy last session". */
  importedFrom?: string
}

// The in-progress workout lives in localStorage so closing the app mid-session loses nothing.
const KEY = 'gymbuddies-live-workout-v1'

export function loadDraft(): LiveDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LiveDraft) : null
  } catch {
    return null
  }
}

function storeDraft(d: LiveDraft | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable (private mode): the session just isn't persisted */
  }
}

function exercisesFor(dayName: string, plan: PlanDay[], history: Workout[]): DraftExercise[] {
  const day = plan.find((d) => d.name === dayName)
  return (day?.exercises ?? []).map((e) => newExercise(e.name, history, e.sets, e.reps))
}

/** Prefill sets from the last time this exercise was done, else from the plan. */
function newExercise(name: string, history: Workout[], planSets = 3, planReps = 10): DraftExercise {
  const last = lastPerformance(history, name)
  if (isCardioExercise(name)) {
    // One interval by default; plan "reps" is the target minutes for cardio.
    const prev = last?.sets.filter(isCardioSet) ?? []
    return {
      name,
      cardio: true,
      sets: prev.length
        ? prev.map((p) => ({ weight: p.distance_km ? String(p.distance_km) : '', reps: p.minutes ? String(p.minutes) : '', done: false }))
        : [{ weight: '', reps: planReps ? String(planReps) : '', done: false }],
    }
  }
  const count = Math.max(1, last?.sets.length ?? planSets)
  return {
    name,
    sets: Array.from({ length: count }, (_, i) => {
      const prev = last?.sets[Math.min(i, (last?.sets.length ?? 1) - 1)]
      return {
        weight: prev?.weight_kg ? String(prev.weight_kg) : '',
        reps: String(prev?.reps ?? planReps),
        done: false,
      }
    }),
  }
}

/** Exactly what was done last session: same exercises, order, weights and reps. */
function exercisesFromSession(w: Workout): DraftExercise[] {
  return w.exercises
    .map((e) => {
      const sets = setsOf(e)
      const cardio = isCardioExercise(e.name) || sets.some(isCardioSet)
      return {
        name: e.name,
        cardio,
        sets: sets.map((st) =>
          cardio
            ? { weight: st.distance_km ? String(st.distance_km) : '', reps: st.minutes ? String(st.minutes) : '', done: false }
            : { weight: st.weight_kg ? String(st.weight_kg) : '', reps: String(st.reps), done: false },
        ),
      }
    })
    .filter((e) => e.sets.length > 0)
}

export function startDraft(dayName: string, plan: PlanDay[], history: Workout[]): LiveDraft {
  const d: LiveDraft = { startedAt: Date.now(), dayName, exercises: exercisesFor(dayName, plan, history), notes: '' }
  storeDraft(d)
  return d
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function LiveWorkout({
  draft: initial,
  plan,
  history,
  onMinimize,
  onFinished,
}: {
  draft: LiveDraft | null
  plan: PlanDay[]
  history: Workout[]
  /** Close the screen but keep the session running. */
  onMinimize: () => void
  /** Saved or discarded. */
  onFinished: (saved: boolean) => void
}) {
  const [draft, setDraft] = useState<LiveDraft | null>(initial)
  const [now, setNow] = useState(() => Date.now())
  const [picker, setPicker] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(initial), [initial])

  useEffect(() => {
    if (!initial) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [initial])

  if (!draft) return <Popup opened={false} />

  function update(next: LiveDraft) {
    setDraft(next)
    storeDraft(next)
  }

  function patchSet(ei: number, si: number, patch: Partial<DraftSet>) {
    update({
      ...draft!,
      exercises: draft!.exercises.map((e, i) =>
        i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e,
      ),
    })
  }

  function chooseDay(name: string) {
    const anyDone = draft!.exercises.some((e) => e.sets.some((s) => s.done))
    // Before the first set, switching day reloads that day's exercises; after, it only renames.
    update({ ...draft!, dayName: name, exercises: anyDone ? draft!.exercises : exercisesFor(name, plan, history) })
  }

  const doneSets = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const prevSession = lastSession(history, draft.dayName)

  function importPrev() {
    if (!prevSession) return
    update({ ...draft!, exercises: exercisesFromSession(prevSession), importedFrom: prevSession.id })
  }

  async function finish() {
    if (doneSets === 0) {
      setError('Tick at least one set as done, or use Quick log instead.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const exercises: WorkoutExercise[] = draft!.exercises
        .map((e) => {
          const log: SetEntry[] = e.sets
            .filter((s) => s.done)
            .map((s) =>
              e.cardio
                ? {
                    weight_kg: null,
                    reps: 0,
                    minutes: Number(s.reps) > 0 ? Math.min(600, Math.round(Number(s.reps) * 10) / 10) : null,
                    distance_km: Number(s.weight) > 0 ? Math.min(500, Math.round(Number(s.weight) * 100) / 100) : null,
                  }
                : { weight_kg: Number(s.weight) > 0 ? Number(s.weight) : null, reps: Math.max(1, Math.round(Number(s.reps) || 1)) },
            )
            // A ticked cardio interval with neither minutes nor km has nothing to save.
            .filter((s) => !e.cardio || s.minutes || s.distance_km)
          const top = Math.max(0, ...log.map((s) => s.weight_kg ?? 0))
          return {
            name: e.name,
            sets: log.length,
            reps: log[log.length - 1]?.reps ?? 0,
            weight_kg: top || null,
            done: true,
            set_log: log,
          }
        })
        .filter((e) => e.set_log.length > 0)
      await addWorkout({
        local_date: toISODate(new Date(draft!.startedAt)),
        day_name: draft!.dayName,
        exercises,
        duration_min: Math.min(600, Math.max(1, Math.round((Date.now() - draft!.startedAt) / 60000))),
        notes: draft!.notes.trim() || null,
      })
      storeDraft(null)
      onFinished(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save workout')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popup opened={!!initial} onBackdropClick={onMinimize}>
      <Page>
        <Navbar
          title={<span className="num">{elapsed(now - draft.startedAt)}</span>}
          subtitle={`${draft.dayName} · ${doneSets} set${doneSets === 1 ? '' : 's'} done`}
          left={<Link onClick={onMinimize}>Hide</Link>}
          right={
            <Link onClick={busy ? undefined : finish} className="font-semibold text-primary!">
              {busy ? <Preloader className="h-5! w-5!" /> : 'Finish'}
            </Link>
          }
        />

        <div className="space-y-4 px-4 py-4 pb-24">
          {error && <p className="rounded-xl bg-move/15 px-3 py-2 text-center text-sm text-move">{error}</p>}

          <DayChips options={dayOptions(plan)} value={draft.dayName} onChange={chooseDay} />

          {prevSession &&
            (draft.importedFrom === prevSession.id ? (
              <p className="px-1 text-[13px] text-muted">
                ✓ Copied your {draft.dayName} session from {timeAgo(prevSession.local_date + 'T12:00:00')}. Beat it!
              </p>
            ) : (
              <button
                type="button"
                onClick={() => (doneSets > 0 ? setConfirmImport(true) : importPrev())}
                className="flex w-full items-center gap-3 rounded-2xl bg-primary/12 px-4 py-3 text-left active:bg-primary/20"
              >
                <span className="text-[22px] text-primary">↺</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold text-primary">Copy last {draft.dayName} session</div>
                  <div className="truncate text-[13px] text-muted">
                    {timeAgo(prevSession.local_date + 'T12:00:00')} · {prevSession.exercises.length} exercise
                    {prevSession.exercises.length === 1 ? '' : 's'} with the same weights & reps
                  </div>
                </div>
              </button>
            ))}

          {draft.exercises.map((ex, ei) => {
            const last = lastPerformance(history, ex.name)
            return (
              <section key={ei} className="rounded-2xl bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[17px] font-semibold">{ex.name}</h3>
                    <p className="truncate text-[13px] text-muted">
                      {last
                        ? `Last ${timeAgo(last.date + 'T12:00:00')}: ${last.sets.map(formatSet).join(', ')}`
                        : 'First time logging this'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${ex.name}`}
                    className="p-1 text-muted"
                    onClick={() => update({ ...draft, exercises: draft.exercises.filter((_, i) => i !== ei) })}
                  >
                    <IconClose size={18} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-x-2 gap-y-2 text-center">
                  <span className="text-[11px] font-semibold text-muted uppercase">Set</span>
                  <span className="text-[11px] font-semibold text-muted uppercase">{ex.cardio ? 'Min' : 'kg'}</span>
                  <span className="text-[11px] font-semibold text-muted uppercase">{ex.cardio ? 'Km' : 'Reps'}</span>
                  <span />
                  {ex.sets.map((s, si) => (
                    <div key={si} className="contents">
                      <span className={`num text-[15px] font-semibold ${s.done ? 'text-primary' : 'text-muted'}`}>{si + 1}</span>
                      {ex.cardio ? (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="–"
                            value={s.reps}
                            onChange={(e) => patchSet(ei, si, { reps: e.target.value })}
                            className={`num h-10 w-full rounded-lg text-center outline-none focus:ring-2 focus:ring-primary ${s.done ? 'bg-primary/15' : 'bg-card-2'}`}
                            aria-label={`Interval ${si + 1} minutes`}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="–"
                            value={s.weight}
                            onChange={(e) => patchSet(ei, si, { weight: e.target.value })}
                            className={`num h-10 w-full rounded-lg text-center outline-none focus:ring-2 focus:ring-primary ${s.done ? 'bg-primary/15' : 'bg-card-2'}`}
                            aria-label={`Interval ${si + 1} distance in km`}
                          />
                        </>
                      ) : (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="–"
                            value={s.weight}
                            onChange={(e) => patchSet(ei, si, { weight: e.target.value })}
                            className={`num h-10 w-full rounded-lg text-center outline-none focus:ring-2 focus:ring-primary ${s.done ? 'bg-primary/15' : 'bg-card-2'}`}
                            aria-label={`Set ${si + 1} weight`}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={s.reps}
                            onChange={(e) => patchSet(ei, si, { reps: e.target.value })}
                            className={`num h-10 w-full rounded-lg text-center outline-none focus:ring-2 focus:ring-primary ${s.done ? 'bg-primary/15' : 'bg-card-2'}`}
                            aria-label={`Set ${si + 1} reps`}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={s.done ? `Undo set ${si + 1}` : `Complete set ${si + 1}`}
                        onClick={() => patchSet(ei, si, { done: !s.done })}
                        className={`flex h-10 w-11 items-center justify-center rounded-lg ${s.done ? 'bg-primary text-black' : 'bg-card-2 text-white/40'}`}
                      >
                        <IconCheck size={20} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[15px] font-medium text-primary"
                    onClick={() => {
                      const prev = ex.sets[ex.sets.length - 1]
                      update({
                        ...draft,
                        exercises: draft.exercises.map((e, i) =>
                          i === ei ? { ...e, sets: [...e.sets, ex.cardio ? { weight: '', reps: '', done: false } : { weight: prev?.weight ?? '', reps: prev?.reps ?? '10', done: false }] } : e,
                        ),
                      })
                    }}
                  >
                    <IconPlus size={18} /> {ex.cardio ? 'Add interval' : 'Add set'}
                  </button>
                  {ex.sets.length > 1 && (
                    <button
                      type="button"
                      className="text-[15px] text-muted"
                      onClick={() =>
                        update({
                          ...draft,
                          exercises: draft.exercises.map((e, i) => (i === ei ? { ...e, sets: e.sets.slice(0, -1) } : e)),
                        })
                      }
                    >
                      Remove last
                    </button>
                  )}
                </div>
              </section>
            )
          })}

          <button
            type="button"
            onClick={() => setPicker(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 py-4 text-[16px] font-semibold text-primary active:bg-card"
          >
            <IconPlus size={20} /> Add exercise
          </button>

          <textarea
            value={draft.notes}
            onChange={(e) => update({ ...draft, notes: e.target.value })}
            placeholder="Notes (optional): PRs, how it felt…"
            rows={2}
            className="w-full resize-none rounded-2xl bg-card p-4 text-[16px] outline-none placeholder:text-muted"
          />

          <button type="button" className="w-full py-2 text-[15px] text-move" onClick={() => setConfirmDiscard(true)}>
            Discard workout
          </button>
        </div>

        <ExercisePicker
          opened={picker}
          onClose={() => setPicker(false)}
          onPick={(name) => update({ ...draft, exercises: [...draft.exercises, newExercise(name, history)] })}
        />

        <Dialog
          opened={confirmImport}
          onBackdropClick={() => setConfirmImport(false)}
          title="Replace this session?"
          content={`Your ticked sets will be replaced with your last ${draft.dayName} session.`}
          buttons={
            <>
              <DialogButton onClick={() => setConfirmImport(false)}>Keep</DialogButton>
              <DialogButton
                strong
                onClick={() => {
                  setConfirmImport(false)
                  importPrev()
                }}
              >
                Replace
              </DialogButton>
            </>
          }
        />

        <Dialog
          opened={confirmDiscard}
          onBackdropClick={() => setConfirmDiscard(false)}
          title="Discard workout?"
          content="Everything logged in this session will be lost."
          buttons={
            <>
              <DialogButton onClick={() => setConfirmDiscard(false)}>Keep</DialogButton>
              <DialogButton
                strong
                className="text-move!"
                onClick={() => {
                  setConfirmDiscard(false)
                  storeDraft(null)
                  onFinished(false)
                }}
              >
                Discard
              </DialogButton>
            </>
          }
        />
      </Page>
    </Popup>
  )
}
