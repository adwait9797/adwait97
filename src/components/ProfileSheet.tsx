import { Link, List, ListButton, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useEffect, useRef, useState } from 'react'
import { fetchPlan, savePlan, saveProfile, uploadAvatar } from '../lib/api'
import { useAuth } from '../lib/auth'
import { splitById } from '../lib/exercises'
import type { Goal, PlanDay, Profile } from '../lib/types'
import { Avatar } from './Avatar'
import { IconCamera } from './icons'
import { PlanEditor } from './PlanEditor'
import { Seg } from './Seg'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[16px]">{label}</span>
      {children}
    </label>
  )
}

const numCls = 'num w-24 bg-transparent text-right text-[16px] text-muted outline-none focus:text-white'

export function ProfileSheet({
  opened,
  onClose,
  onPlanChanged,
}: {
  opened: boolean
  onClose: () => void
  onPlanChanged: (plan: PlanDay[]) => void
}) {
  const { profile, setProfile, signOut } = useAuth()
  const [draft, setDraft] = useState<Profile | null>(profile)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (opened) {
      setDraft(profile)
      setPhoto(null)
      setPreview(null)
      setError(null)
    }
  }, [opened, profile])

  if (!draft) return null
  const set = (p: Partial<Profile>) => setDraft({ ...draft, ...p })

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const avatar_url = photo ? await uploadAvatar(photo) : draft.avatar_url
      const p = await saveProfile({
        display_name: draft.display_name.trim() || 'Me',
        avatar_url,
        weight_kg: draft.weight_kg,
        height_cm: draft.height_cm,
        goal: draft.goal,
        weekly_target: Math.min(7, Math.max(1, draft.weekly_target)),
        calorie_target: Math.min(8000, Math.max(800, draft.calorie_target)),
      })
      setProfile(p)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function openPlan() {
    setPlan(await fetchPlan())
    setPlanOpen(true)
  }

  async function savePlanAndClose() {
    setBusy(true)
    try {
      await savePlan(plan)
      onPlanChanged(await fetchPlan())
      setPlanOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save plan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page>
        <Navbar
          title="Profile"
          left={
            <Link onClick={onClose}>
              Cancel
            </Link>
          }
          right={
            <Link onClick={busy ? undefined : save} className="font-semibold">
              {busy ? <Preloader className="h-5! w-5!" /> : 'Save'}
            </Link>
          }
        />
        <div className="flex flex-col items-center gap-2 pt-6">
          <button type="button" className="relative" onClick={() => fileRef.current?.click()}>
            <Avatar url={preview ?? draft.avatar_url} name={draft.display_name} size={96} />
            <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-black ring-4 ring-black">
              <IconCamera size={16} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setPhoto(f)
                setPreview(URL.createObjectURL(f))
              }
            }}
          />
          <input
            value={draft.display_name}
            onChange={(e) => set({ display_name: e.target.value })}
            maxLength={30}
            className="w-full bg-transparent text-center text-[24px] font-bold outline-none"
          />
        </div>

        {error && <p className="px-6 text-center text-sm text-move">{error}</p>}

        <div className="mx-4 mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
          <Row label="Weight (kg)">
            <input
              className={numCls}
              type="number"
              inputMode="decimal"
              value={draft.weight_kg ?? ''}
              onChange={(e) => set({ weight_kg: e.target.value ? Number(e.target.value) : null })}
            />
          </Row>
          <Row label="Height (cm)">
            <input
              className={numCls}
              type="number"
              inputMode="decimal"
              value={draft.height_cm ?? ''}
              onChange={(e) => set({ height_cm: e.target.value ? Number(e.target.value) : null })}
            />
          </Row>
          <Row label="Workouts / week">
            <input
              className={numCls}
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={draft.weekly_target}
              onChange={(e) => set({ weekly_target: Number(e.target.value) || 1 })}
            />
          </Row>
          <Row label="Calorie target">
            <input
              className={numCls}
              type="number"
              inputMode="numeric"
              value={draft.calorie_target}
              onChange={(e) => set({ calorie_target: Number(e.target.value) || 0 })}
            />
          </Row>
        </div>

        <div className="mx-4 mt-4">
          <Seg<Goal>
            value={draft.goal}
            onChange={(g) => set({ goal: g })}
            options={[
                { value: 'lose', label: 'Lose fat' },
                { value: 'maintain', label: 'Maintain' },
                { value: 'gain', label: 'Gain' },
              ]}
          />
        </div>

        <List strongIos insetIos>
          <ListButton onClick={openPlan}>Edit workout plan ({splitById(draft.split).name})</ListButton>
        </List>
        <div className="mx-4 mb-4">
          <button
            type="button"
            className="w-full rounded-2xl bg-card py-3.5 text-[17px] text-move active:bg-card-2"
            onClick={async () => {
              onClose()
              await signOut()
            }}
          >
            Sign out
          </button>
        </div>
        <p className="px-8 pb-10 text-center text-xs text-muted">
          Weight, height and individual meals are private. Friends see your name, photo, workouts and daily calorie
          total.
        </p>

        <Popup opened={planOpen} onBackdropClick={() => setPlanOpen(false)}>
          <Page>
            <Navbar
              title="Workout Plan"
              left={
                <Link onClick={() => setPlanOpen(false)}>
                  Cancel
                </Link>
              }
              right={
                <Link onClick={busy ? undefined : savePlanAndClose} className="font-semibold">
                  Save
                </Link>
              }
            />
            <div className="py-4 pb-16">
              <PlanEditor days={plan} onChange={setPlan} />
            </div>
          </Page>
        </Popup>
      </Page>
    </Popup>
  )
}
