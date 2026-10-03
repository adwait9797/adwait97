import { Button, Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useEffect, useRef, useState } from 'react'
import { addMeal, analyzeMeal, type ChatTurn } from '../lib/api'
import { today } from '../lib/dates'
import { blobToBase64, resizeImage } from '../lib/image'
import type { MealEstimate } from '../lib/types'
import { IconCamera, IconClose, IconSend, IconSparkle } from './icons'

interface Bubble {
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
  estimate?: MealEstimate
  error?: boolean
}

const GREETING: Bubble = {
  role: 'assistant',
  text: 'What did you eat? Describe it ("2 eggs, toast with butter, latte") or snap a photo and I\'ll estimate the calories.',
}

export function LogMealSheet({ opened, onClose, onSaved }: { opened: boolean; onClose: () => void; onSaved: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([GREETING])
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [estimate, setEstimate] = useState<MealEstimate | null>(null)
  const [text, setText] = useState('')
  const [pendingImage, setPendingImage] = useState<{ b64: string; url: string } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manual, setManual] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!opened) return
    setBubbles([GREETING])
    setTurns([])
    setEstimate(null)
    setText('')
    setPendingImage(null)
    setManual(false)
  }, [opened])

  useEffect(() => {
    const el = scrollRef.current?.closest('.overflow-auto, .overflow-y-auto') ?? scrollRef.current?.parentElement
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [bubbles, thinking])

  async function pickImage(file: File) {
    try {
      const blob = await resizeImage(file, 1024, 0.8)
      setPendingImage({ b64: await blobToBase64(blob), url: URL.createObjectURL(blob) })
    } catch {
      setBubbles((b) => [...b, { role: 'assistant', text: "Couldn't read that photo. Try another one?", error: true }])
    }
  }

  async function send() {
    const msg = text.trim()
    if ((!msg && !pendingImage) || thinking) return
    const userTurn: ChatTurn = { role: 'user', text: msg, image: pendingImage?.b64 }
    const nextTurns = [...turns, userTurn].slice(-7)
    // The API requires the conversation to start with a user turn.
    while (nextTurns.length && nextTurns[0].role !== 'user') nextTurns.shift()
    setBubbles((b) => [...b, { role: 'user', text: msg, imageUrl: pendingImage?.url }])
    setText('')
    setPendingImage(null)
    setThinking(true)
    try {
      const est = await analyzeMeal(nextTurns)
      setBubbles((b) => [...b, { role: 'assistant', text: est.reply, estimate: est.is_food ? est : undefined }])
      if (est.is_food) setEstimate(est)
      setTurns([
        ...nextTurns,
        {
          role: 'assistant',
          text: est.is_food
            ? `${est.reply}\nCurrent estimate: ${JSON.stringify({ meal_name: est.meal_name, items: est.items, total: est.total })}`
            : est.reply,
        },
      ])
    } catch (err) {
      setBubbles((b) => [
        ...b,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Something went wrong', error: true },
      ])
      setTurns(nextTurns.slice(0, -1))
    } finally {
      setThinking(false)
    }
  }

  async function save(e: MealEstimate) {
    setSaving(true)
    try {
      await addMeal({
        local_date: today(),
        name: e.meal_name || 'Meal',
        items: e.items,
        calories: Math.round(e.total.calories),
        protein_g: Math.round(e.total.protein_g),
        carbs_g: Math.round(e.total.carbs_g),
        fat_g: Math.round(e.total.fat_g),
      })
      onSaved()
      onClose()
    } catch (err) {
      setBubbles((b) => [
        ...b,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Could not save', error: true },
      ])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      <Page className="flex flex-col">
        <Navbar
          title="Log Meal"
          left={
            <Link onClick={onClose}>
              Cancel
            </Link>
          }
          right={
            <Link onClick={() => setManual(!manual)}>
              {manual ? 'Chat' : 'Manual'}
            </Link>
          }
        />

        {manual ? (
          <ManualMeal saving={saving} onSave={save} />
        ) : (
          <>
            <div className="flex-1 space-y-3 px-4 py-4 pb-40" ref={scrollRef}>
              {bubbles.map((b, i) => (
                <div key={i} className={`fade-up flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%] space-y-2">
                    {b.imageUrl && <img src={b.imageUrl} alt="Meal" className="ml-auto max-h-56 rounded-2xl object-cover" />}
                    {b.text && (
                      <div
                        className={`rounded-[20px] px-4 py-2.5 text-[16px] leading-snug ${
                          b.role === 'user'
                            ? 'rounded-br-md bg-primary text-black'
                            : b.error
                              ? 'rounded-bl-md bg-move/20 text-white'
                              : 'rounded-bl-md bg-card text-white'
                        }`}
                      >
                        {b.text}
                      </div>
                    )}
                    {b.estimate && (
                      <EstimateCard
                        estimate={b.estimate}
                        latest={b.estimate === estimate}
                        saving={saving}
                        onSave={() => save(b.estimate!)}
                      />
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <IconSparkle size={16} className="animate-pulse text-primary" /> Estimating…
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/85 px-3 pt-2 backdrop-blur-xl">
              {pendingImage && (
                <div className="relative mb-2 inline-block">
                  <img src={pendingImage.url} alt="Selected meal" className="h-20 w-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPendingImage(null)}
                    className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-card-2"
                  >
                    <IconClose size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  aria-label="Add photo"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-primary active:bg-card-2"
                >
                  <IconCamera size={22} />
                </button>
                <textarea
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder={estimate ? 'Correct it, e.g. "it was 2 rotis"' : 'Describe your meal…'}
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-[20px] border border-white/15 bg-card px-4 py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  aria-label="Send"
                  disabled={thinking || (!text.trim() && !pendingImage)}
                  onClick={send}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-black disabled:opacity-30"
                >
                  <IconSend size={20} strokeWidth={2.5} />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickImage(f)
                  e.target.value = ''
                }}
              />
            </div>
          </>
        )}
      </Page>
    </Popup>
  )
}

function EstimateCard({
  estimate,
  latest,
  saving,
  onSave,
}: {
  estimate: MealEstimate
  latest: boolean
  saving: boolean
  onSave: () => void
}) {
  const t = estimate.total
  return (
    <div className={`rounded-2xl bg-card p-4 ${latest ? '' : 'opacity-50'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-semibold">{estimate.meal_name}</span>
        {estimate.confidence === 'low' && <span className="text-xs text-[#ff9f0a]">rough guess</span>}
      </div>
      <div className="num mt-1 text-[34px] leading-none font-bold text-exercise">
        {Math.round(t.calories)}
        <span className="ml-1 text-base font-semibold text-muted">kcal</span>
      </div>
      <div className="num mt-2 flex gap-4 text-[13px]">
        <span>
          <b className="text-move">P</b> {Math.round(t.protein_g)}g
        </span>
        <span>
          <b className="text-stand">C</b> {Math.round(t.carbs_g)}g
        </span>
        <span>
          <b className="text-[#ff9f0a]">F</b> {Math.round(t.fat_g)}g
        </span>
      </div>
      <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[14px]">
        {estimate.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {it.name} <span className="text-muted">· {it.quantity}</span>
            </span>
            <span className="num shrink-0 text-muted">{Math.round(it.calories)}</span>
          </li>
        ))}
      </ul>
      {latest && (
        <Button rounded large className="mt-4 font-semibold text-black" disabled={saving} onClick={onSave}>
          {saving ? <Preloader className="h-5! w-5!" /> : 'Save meal'}
        </Button>
      )}
    </div>
  )
}

function ManualMeal({ saving, onSave }: { saving: boolean; onSave: (e: MealEstimate) => void }) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [p, setP] = useState('')
  const [c, setC] = useState('')
  const [f, setF] = useState('')
  const field = 'num w-full rounded-xl bg-card px-4 py-3 text-[17px] outline-none placeholder:text-muted'
  return (
    <div className="space-y-3 px-4 py-4">
      <p className="text-sm text-muted">Know the numbers already? Enter them directly.</p>
      <input className={field} placeholder="Meal name" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className={field}
        type="number"
        inputMode="numeric"
        placeholder="Calories (kcal)"
        value={kcal}
        onChange={(e) => setKcal(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <input className={field} type="number" inputMode="numeric" placeholder="Protein g" value={p} onChange={(e) => setP(e.target.value)} />
        <input className={field} type="number" inputMode="numeric" placeholder="Carbs g" value={c} onChange={(e) => setC(e.target.value)} />
        <input className={field} type="number" inputMode="numeric" placeholder="Fat g" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <Button
        large
        rounded
        className="font-semibold text-black"
        disabled={saving || !name.trim() || !(Number(kcal) > 0)}
        onClick={() =>
          onSave({
            is_food: true,
            reply: '',
            meal_name: name.trim(),
            items: [],
            total: { calories: Number(kcal), protein_g: Number(p) || 0, carbs_g: Number(c) || 0, fat_g: Number(f) || 0 },
            confidence: 'high',
          })
        }
      >
        {saving ? <Preloader className="h-5! w-5!" /> : 'Save meal'}
      </Button>
    </div>
  )
}
