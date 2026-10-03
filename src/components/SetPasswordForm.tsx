import { Button, Preloader } from 'konsta/react'
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const field =
  'w-full rounded-xl bg-card px-4 py-3.5 text-[17px] outline-none placeholder:text-muted focus:ring-2 focus:ring-primary'

/** New password + confirmation, saved to the signed-in account. */
export function SetPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError("The passwords don't match.")
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className={field}
        type="password"
        autoComplete="new-password"
        placeholder="New password (at least 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <input
        className={field}
        type="password"
        autoComplete="new-password"
        placeholder="Repeat new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-center text-sm text-move">{error}</p>}
      <Button large rounded type="submit" disabled={busy || !password || !confirm} className="font-semibold text-black">
        {busy ? <Preloader className="h-5! w-5!" /> : submitLabel}
      </Button>
    </form>
  )
}
