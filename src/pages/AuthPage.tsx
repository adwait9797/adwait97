import { Block, Button, List, ListInput, Page, Preloader } from 'konsta/react'
import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { Seg } from '../components/Seg'
import { authLinkError, supabase } from '../lib/supabase'

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(authLinkError)
  const [notice, setNotice] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  // Emails a Supabase reset link back to this site, where "Set a new password" opens.
  async function requestReset(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (error) throw error
      setNotice('Check your inbox (and spam) for a reset link. It can take a minute to arrive.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email, try again in a minute.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then log in.')
          setMode('login')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page className="pt-safe">
      <div className="flex min-h-full flex-col justify-center pb-10">
        <div className="fade-up flex flex-col items-center px-6 pt-10 text-center">
          <Logo />
          <p className="mt-5 max-w-xs text-[17px] text-muted">
            Track workouts and meals, and see who's already hit the gym today.
          </p>
        </div>

        {forgot ? (
          <form onSubmit={requestReset} className="mt-8">
            <h2 className="px-4 text-center text-[22px] font-bold">Reset your password</h2>
            <p className="mt-1 px-8 text-center text-[15px] text-muted">Enter the email you signed up with and we'll send you a reset link.</p>
            <List strongIos insetIos>
              <ListInput
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              />
            </List>
            {error && <p className="px-8 text-center text-sm text-move">{error}</p>}
            {notice && <p className="px-8 text-center text-sm text-stand">{notice}</p>}
            <Block>
              <Button large rounded type="submit" disabled={busy || !email.trim()} className="font-semibold text-black">
                {busy ? <Preloader className="h-5! w-5!" /> : 'Send reset link'}
              </Button>
            </Block>
            <button
              type="button"
              className="mx-auto block text-[15px] text-primary"
              onClick={() => {
                setForgot(false)
                setError(null)
                setNotice(null)
              }}
            >
              Back to log in
            </button>
          </form>
        ) : (
          <>
          <Block className="mt-8!">
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: 'login', label: 'Log in' },
                { value: 'register', label: 'Register' },
              ]}
            />
          </Block>

          <form onSubmit={submit}>
            <List strongIos insetIos>
              <ListInput
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              />
              <ListInput
                label="Password"
                type="password"
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                value={password}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              />
            </List>

            {error && <p className="px-8 text-center text-sm text-move">{error}</p>}
            {notice && <p className="px-8 text-center text-sm text-stand">{notice}</p>}

            <Block>
              <Button large rounded type="submit" disabled={busy || !email || !password} className="font-semibold text-black">
                {busy ? <Preloader className="h-5! w-5!" /> : mode === 'login' ? 'Log in' : 'Create account'}
              </Button>
            </Block>
            {mode === 'login' && (
              <button
                type="button"
                className="mx-auto block text-[15px] text-primary"
                onClick={() => {
                  setForgot(true)
                  setError(null)
                  setNotice(null)
                }}
              >
                Forgot password?
              </button>
            )}
          </form>
          </>
        )}
      </div>
    </Page>
  )
}
