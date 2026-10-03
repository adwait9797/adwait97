import { Button, Preloader, Sheet } from 'konsta/react'
import { useState } from 'react'
import { saveProfile } from '../lib/api'
import { timeAgo } from '../lib/dates'

export const STATUS_MAX = 20


/** Counts emoji as one character, like people expect. */
export function charCount(s: string): number {
  return [...s].length
}

function clip(s: string): string {
  return [...s].slice(0, STATUS_MAX).join('')
}

/** Post or clear a short banter status that friends see for 24 hours. */
export function StatusSheet({
  opened,
  current,
  currentAt,
  onClose,
  onSaved,
}: {
  opened: boolean
  current: string | null
  currentAt: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(value: string | null) {
    setBusy(true)
    setError(null)
    try {
      await saveProfile(value ? { status_text: value, status_at: new Date().toISOString() } : { status_text: null, status_at: null })
      setText('')
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save'
      setError(/status_(text|at)/.test(msg) ? 'Status needs a quick database update. Ask Adwait to run update_friends.sql.' : msg)
    } finally {
      setBusy(false)
    }
  }

  const trimmed = text.trim()

  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="rounded-t-3xl bg-card!">
      <div className="pb-safe space-y-4 px-4 pt-3">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
        <div>
          <h2 className="text-[22px] font-bold">Status for banter 💬</h2>
          <p className="text-[14px] text-muted">Shows on your photo in Friends and disappears after 24 hours.</p>
        </div>

        {current && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-card-2 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold">“{current}”</div>
              {currentAt && <div className="text-[12px] text-muted">posted {timeAgo(currentAt)}</div>}
            </div>
            <button type="button" disabled={busy} onClick={() => save(null)} className="shrink-0 text-[15px] text-move">
              Clear
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (trimmed) save(trimmed)
          }}
          className="space-y-3"
        >
          <div className="relative">
            <input
              value={text}
              onChange={(e) => setText(clip(e.target.value))}
              placeholder="Say something to your friends…"
              enterKeyHint="send"
              className="w-full rounded-xl bg-card-2 px-4 py-3.5 pr-16 text-[17px] outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
            />
            <span
              className={`num absolute top-1/2 right-4 -translate-y-1/2 text-[13px] ${charCount(text) >= STATUS_MAX ? 'text-move' : 'text-muted'}`}
            >
              {charCount(text)}/{STATUS_MAX}
            </span>
          </div>
          {error && <p className="text-center text-sm text-move">{error}</p>}
          <Button large rounded type="submit" disabled={busy || !trimmed} className="font-semibold text-black">
            {busy ? <Preloader className="h-5! w-5!" /> : current ? 'Replace status' : 'Post status'}
          </Button>
        </form>
      </div>
    </Sheet>
  )
}
