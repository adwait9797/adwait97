import { Button, Link, Navbar, Page, Popup, Preloader } from 'konsta/react'
import { useEffect, useRef, useState } from 'react'
import { addMeal, analyzeMeal, type ChatTurn } from '../lib/api'
import { today } from '../lib/dates'
import { blobToBase64, resizeImage } from '../lib/image'
import { useDictation } from '../lib/useDictation'
import type { MealEstimate, MealItem } from '../lib/types'
import { IconCamera, IconClose, IconMic, IconSend, IconSparkle } from './icons'

interface Bubble {
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
  estimate?: MealEstimate
  error?: boolean
}

const GREETING: Bubble = {
  role: 'assistant',
  text: 'What did you eat? Describe it ("2 eggs, toast with butter, latte"), say it with the 🎤, or snap a photo and I\'ll estimate the calories.',
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation(setText)
  const { stop: stopDictation, clearError: clearDictationError } = dictation

  useEffect(() => {
    if (!opened) {
      stopDictation()
      return
    }
    setBubbles([GREETING])
    setTurns([])
    setEstimate(null)
    setText('')
    setPendingImage(null)
    setManual(false)
    clearDictationError()
  }, [opened, stopDictation, clearDictationError])

  // Grow the text box with its content (dictation can fill several lines); max-h caps it.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

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
    dictation.stop()
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

  // Manual tweak on the latest card: swap it in everywhere, and tell the AI so later corrections build on it.
  function editEstimate(prev: MealEstimate, next: MealEstimate) {
    setEstimate(next)
    setBubbles((bs) => bs.map((b) => (b.estimate === prev ? { ...b, estimate: next } : b)))
    setTurns((ts) => {
      const i = ts.map((t) => t.role).lastIndexOf('assistant')
      if (i < 0) return ts
      const note = `Current estimate (adjusted by the user): ${JSON.stringify({ meal_name: next.meal_name, items: next.items, total: next.total })}`
      return ts.map((t, j) => (j === i ? { ...t, text: `${t.text.split('\nCurrent estimate')[0]}\n${note}` } : t))
    })
  }

  async function save(e: MealEstimate) {
    setSaving(true)
    try {
      await addMeal({
        local_date: today(),
        name: e.meal_name || 'Meal',
        items: e.items.map((it) => ({
          ...it,
          calories: Math.round(it.calories),
          protein_g: Math.round(it.protein_g),
          carbs_g: Math.round(it.carbs_g),
          fat_g: Math.round(it.fat_g),
        })),
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
                        onEdit={(next) => editEstimate(b.estimate!, next)}
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
              {dictation.error && (
                <div className="mb-2 flex items-start gap-2 rounded-xl bg-move/20 px-3 py-2 text-[13px] leading-snug">
                  <span className="flex-1">{dictation.error}</span>
                  <button type="button" aria-label="Dismiss" onClick={dictation.clearError} className="text-muted">
                    <IconClose size={14} />
                  </button>
                </div>
              )}
              {dictation.listening && (
                <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-move">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-move" /> Listening… tap the mic when you're done
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
                <button
                  type="button"
                  aria-label={dictation.listening ? 'Stop dictation' : 'Speak your meal'}
                  aria-pressed={dictation.listening}
                  onClick={() => (dictation.listening ? dictation.stop() : dictation.start(text))}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    dictation.listening ? 'animate-pulse bg-move text-white' : 'bg-card text-primary active:bg-card-2'
                  }`}
                >
                  <IconMic size={22} />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder={
                    dictation.listening ? 'Speak now…' : estimate ? 'Correct it, e.g. "it was 2 rotis"' : 'Describe your meal…'
                  }
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

const round = (n: number) => Math.round(n)

/** Change one item's calories; its macros scale with it and the totals move by the difference. */
function withItemCalories(e: MealEstimate, index: number, calories: number): MealEstimate {
  const old = e.items[index]
  const ratio = old.calories > 0 ? calories / old.calories : 1
  const item: MealItem = {
    ...old,
    calories,
    protein_g: old.protein_g * ratio,
    carbs_g: old.carbs_g * ratio,
    fat_g: old.fat_g * ratio,
  }
  return {
    ...e,
    items: e.items.map((it, i) => (i === index ? item : it)),
    total: {
      calories: Math.max(0, e.total.calories + item.calories - old.calories),
      protein_g: Math.max(0, e.total.protein_g + item.protein_g - old.protein_g),
      carbs_g: Math.max(0, e.total.carbs_g + item.carbs_g - old.carbs_g),
      fat_g: Math.max(0, e.total.fat_g + item.fat_g - old.fat_g),
    },
  }
}

/** Change the total; every item and macro scales by the same factor. */
function withTotalCalories(e: MealEstimate, calories: number): MealEstimate {
  const ratio = e.total.calories > 0 ? calories / e.total.calories : 1
  const scale = <T extends { calories: number; protein_g: number; carbs_g: number; fat_g: number }>(x: T): T => ({
    ...x,
    calories: x.calories * ratio,
    protein_g: x.protein_g * ratio,
    carbs_g: x.carbs_g * ratio,
    fat_g: x.fat_g * ratio,
  })
  return { ...e, items: e.items.map(scale), total: { ...scale(e.total), calories } }
}

/** A number that turns into an input when tapped; commits on blur or Enter. */
function TapNumber({
  value,
  onCommit,
  className,
  inputClassName,
  label,
}: {
  value: number
  onCommit: (n: number) => void
  className: string
  inputClassName: string
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={() => setDraft(String(round(value)))}
        className={`${className} rounded-md underline decoration-white/25 decoration-dashed underline-offset-4 active:bg-white/10`}
      >
        {round(value)}
      </button>
    )
  }
  const commit = () => {
    const n = Math.round(Number(draft))
    if (draft.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 20000 && n !== round(value)) onCommit(n)
    setDraft(null)
  }
  return (
    <input
      autoFocus
      type="number"
      inputMode="numeric"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
      className={`${inputClassName} num rounded-md bg-card-2 outline-none ring-2 ring-primary`}
    />
  )
}

function EstimateCard({
  estimate,
  latest,
  saving,
  onSave,
  onEdit,
}: {
  estimate: MealEstimate
  latest: boolean
  saving: boolean
  onSave: () => void
  onEdit: (next: MealEstimate) => void
}) {
  const t = estimate.total
  return (
    <div className={`rounded-2xl bg-card p-4 ${latest ? '' : 'opacity-50'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-semibold">{estimate.meal_name}</span>
        {estimate.confidence === 'low' && <span className="text-xs text-[#ff9f0a]">rough guess</span>}
      </div>
      <div className="num mt-1 flex items-baseline text-[34px] leading-none font-bold text-exercise">
        {latest ? (
          <TapNumber
            value={t.calories}
            label="total calories"
            onCommit={(n) => onEdit(withTotalCalories(estimate, n))}
            className="-mx-1 px-1"
            inputClassName="w-36 px-2 py-0.5 text-[34px] font-bold text-exercise"
          />
        ) : (
          round(t.calories)
        )}
        <span className="ml-1 text-base font-semibold text-muted">kcal</span>
      </div>
      <div className="num mt-2 flex gap-4 text-[13px]">
        <span>
          <b className="text-move">P</b> {round(t.protein_g)}g
        </span>
        <span>
          <b className="text-stand">C</b> {round(t.carbs_g)}g
        </span>
        <span>
          <b className="text-[#ff9f0a]">F</b> {round(t.fat_g)}g
        </span>
      </div>
      <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[14px]">
        {estimate.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              {it.name} <span className="text-muted">· {it.quantity}</span>
            </span>
            {latest ? (
              <TapNumber
                value={it.calories}
                label={`${it.name} calories`}
                onCommit={(n) => onEdit(withItemCalories(estimate, i, n))}
                className="num shrink-0 px-1 text-muted"
                inputClassName="w-20 shrink-0 px-2 py-0.5 text-right text-[14px] text-white"
              />
            ) : (
              <span className="num shrink-0 text-muted">{round(it.calories)}</span>
            )}
          </li>
        ))}
      </ul>
      {latest && (
        <>
          <p className="mt-3 text-[12px] text-muted">Tap any calorie number to adjust it.</p>
          <Button rounded large className="mt-3 font-semibold text-black" disabled={saving} onClick={onSave}>
            {saving ? <Preloader className="h-5! w-5!" /> : 'Save meal'}
          </Button>
        </>
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
