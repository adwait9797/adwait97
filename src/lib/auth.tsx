import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchProfile, saveProfile } from './api'
import { deviceTimezone } from './dates'
import { migratedRefreshToken, openedFromRecoveryLink, supabase } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** Signed in via a password-reset link: the app must ask for a new password. */
  recovery: boolean
  endRecovery: () => void
  refreshProfile: () => Promise<void>
  setProfile: (p: Profile) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(openedFromRecoveryLink)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    let p = await fetchProfile(s.user.id)
    // Keep the stored time zone in sync with the phone (people travel), so
    // "trained today" on the friends feed uses the right calendar day.
    const tz = deviceTimezone()
    if (!p || (p.onboarded && p.timezone !== tz)) {
      p = await saveProfile({ timezone: tz })
    }
    setProfile(p)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      let current = data.session
      // Arrived from the old address with its login: restore it here (unless already signed in).
      if (!current && migratedRefreshToken) {
        const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: migratedRefreshToken })
        current = refreshed.session
        if (!active) return
      }
      setSession(current)
      try {
        await loadProfile(current)
      } finally {
        if (active) setLoading(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => {
          loadProfile(s).catch(console.error)
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    loading,
    recovery,
    endRecovery: () => setRecovery(false),
    refreshProfile: () => loadProfile(session),
    setProfile,
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
      setRecovery(false)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
