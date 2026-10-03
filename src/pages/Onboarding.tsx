import { Block, Button, Preloader } from 'konsta/react'
import { useRef, useState, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { IconCamera, IconCheck } from '../components/icons'
import { NumStepper } from '../components/NumStepper'
import { PlanEditor } from '../components/PlanEditor'
import { Seg } from '../components/Seg'
import { savePlan, saveProfile, uploadAvatar } from '../lib/api'
import { useAuth } from '../lib/auth'
import { deviceTimezone } from '../lib/dates'
import { planFromTemplate, recommendedSplit, SPLITS, suggestCalories } from '../lib/exercises'
import type { Goal, PlanDay } from '../lib/types'

const STEPS = 5

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block rounded-2xl bg-card px-4 py-3">
      <span className="text-[13px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'num w-full bg-transparent text-[28px] font-semibold outline-none placeholder:text-white/25'

export function Onboarding() {
  const { profile, setProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.avatar_url ?? null)
  const [weight, setWeight] = useState(profile?.weight_kg?.toString() ?? '')
  const [height, setHeight] = useState(profile?.height_cm?.toString() ?? '')
  const [weekly, setWeekly] = useState(profile?.weekly_target ?? 4)
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'maintain')
  const [calories, setCalories] = useState<string>('')
  const [split, setSplit] = useState<string | null>(null)
  const [planMode, setPlanMode] = useState<'recommended' | 'own'>('recommended')
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const weightNum = Number(weight) || null
  const suggested = suggestCalories(weightNum, goal)
  const recommended = recommendedSplit(weekly)
  const chosenSplit = split ?? recommended

  const canNext = [
    name.trim().length > 0,
    Number(weight) >= 30 && Number(weight) <= 300 && Number(height) >= 100 && Number(height) <= 250,
    true,
    true,
    plan.length > 0 && plan.every((d) => d.name.trim()),
  ][step]

  function next() {
    setError(null)
    if (step === 3) {
      setPlanMode(chosenSplit === 'custom' ? 'own' : 'recommended')
      setPlan(planFromTemplate(chosenSplit))
    }
    if (step < STEPS - 1) setStep(step + 1)
    else finish()
  }

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      const avatar_url = photo ? await uploadAvatar(photo) : (profile?.avatar_url ?? null)
      await savePlan(plan)
      const p = await saveProfile({
        display_name: name.trim(),
        avatar_url,
        weight_kg: Number(weight),
        height_cm: Number(height),
        goal,
        weekly_target: weekly,
        split: chosenSplit,
        calorie_target: Number(calories) || suggested,
        timezone: deviceTimezone(),
        onboarded: true,
      })
      setProfile(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe flex h-full flex-col bg-black">
      {/* Progress */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <button
          type="button"
          className={`text-[17px] text-primary ${step === 0 ? 'invisible' : ''}`}
          onClick={() => setStep(step - 1)}
        >
          Back
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-card-2'}`} />
          ))}
        </div>
        <span className="num w-10 text-right text-sm text-muted">
          {step + 1}/{STEPS}
        </span>
      </div>

      <div key={step} className="fade-up flex-1 overflow-y-auto pb-6">
        {step === 0 && (
          <>
            <Header title="Let's set you up" subtitle="This is how your friends will see you." />
            <div className="flex flex-col items-center gap-3 py-4">
              <button type="button" className="relative" onClick={() => fileRef.current?.click()}>
                <Avatar url={photoPreview} name={name || '?'} size={112} />
                <span className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-black ring-4 ring-black">
                  <IconCamera size={18} />
                </span>
              </button>
              <span className="text-sm text-muted">Profile picture (optional)</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setPhoto(f)
                  setPhotoPreview(URL.createObjectURL(f))
                }}
              />
            </div>
            <div className="px-4">
              <Field label="Display name">
                <input
                  autoFocus
                  value={name}
                  maxLength={30}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Adwait"
                  className="w-full bg-transparent text-[24px] font-semibold outline-none placeholder:text-white/25"
                />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Header title="Your body" subtitle="Private: only you can see this. Used to suggest a calorie target." />
            <div className="grid grid-cols-2 gap-3 px-4">
              <Field label="Weight (kg)">
                <input
                  className={inputCls}
                  type="number"
                  inputMode="decimal"
                  placeholder="75"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <Field label="Height (cm)">
                <input
                  className={inputCls}
                  type="number"
                  inputMode="decimal"
                  placeholder="178"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Header title="Your goals" subtitle="You can change these any time." />
            <div className="space-y-3 px-4">
              <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-4">
                <div>
                  <div className="text-[17px] font-semibold">Workouts per week</div>
                  <div className="num text-[34px] font-bold text-move">{weekly}×</div>
                </div>
                <NumStepper
                  onPlus={() => setWeekly(Math.min(7, weekly + 1))}
                  onMinus={() => setWeekly(Math.max(1, weekly - 1))}
                  plusDisabled={weekly >= 7}
                  minusDisabled={weekly <= 1}
                />
              </div>
              <div className="rounded-2xl bg-card p-4">
                <div className="mb-3 text-[17px] font-semibold">Main goal</div>
                <Seg<Goal>
                  value={goal}
                  onChange={setGoal}
                  options={[
                    { value: 'lose', label: 'Lose fat' },
                    { value: 'maintain', label: 'Maintain' },
                    { value: 'gain', label: 'Gain' },
                  ]}
                />
              </div>
              <Field label="Daily calorie target" hint={`Suggested for you: ${suggested} kcal. Rough estimate, adjust freely.`}>
                <div className="flex items-baseline gap-2">
                  <input
                    className={`${inputCls} text-exercise`}
                    type="number"
                    inputMode="numeric"
                    placeholder={String(suggested)}
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                  />
                  <span className="text-muted">kcal</span>
                </div>
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Header title="Pick your split" subtitle={`For ${weekly} days a week we recommend the highlighted one.`} />
            <div className="space-y-3 px-4">
              {SPLITS.map((s) => {
                const active = chosenSplit === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSplit(s.id)}
                    className={`w-full rounded-2xl p-4 text-left transition ${active ? 'bg-card ring-2 ring-primary' : 'bg-card'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[17px] font-semibold">{s.name}</span>
                      {s.id === recommended && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary uppercase">
                          Recommended
                        </span>
                      )}
                      <span className="ml-auto text-sm text-muted">{s.daysPerWeek}</span>
                      {active && <IconCheck size={20} className="text-primary" />}
                    </div>
                    <p className="mt-1 text-[14px] text-muted">{s.description}</p>
                    {s.id !== 'custom' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.days.map((d) => (
                          <span key={d.name} className="rounded-full bg-card-2 px-2.5 py-0.5 text-[12px]">
                            {d.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Header title="Your workout plan" subtitle="Start from our suggested plan or build your own." />
            <Block className="my-0! mb-4!">
              <Seg
                value={planMode}
                options={[
                  { value: 'recommended', label: 'Suggested plan' },
                  { value: 'own', label: 'Build my own' },
                ]}
                onChange={(m) => {
                  setPlanMode(m)
                  setPlan(
                    m === 'recommended'
                      ? planFromTemplate(chosenSplit === 'custom' ? recommended : chosenSplit)
                      : planFromTemplate(chosenSplit).map((d) => ({ ...d, exercises: [] })),
                  )
                }}
              />
            </Block>
            <PlanEditor days={plan} onChange={setPlan} />
          </>
        )}
      </div>

      <div className="pb-safe border-t border-white/10 bg-black/90 px-4 pt-3 backdrop-blur">
        {error && <p className="mb-2 text-center text-sm text-move">{error}</p>}
        <Button large rounded disabled={!canNext || busy} onClick={next} className="font-semibold text-black">
          {busy ? <Preloader className="h-5! w-5!" /> : step === STEPS - 1 ? "Let's go" : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 pt-6 pb-5">
      <h1 className="text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-[16px] text-muted">{subtitle}</p>
    </div>
  )
}
