import { createClient } from '@supabase/supabase-js'
import { MIGRATE_PARAM } from './domainRedirect'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// Password-reset emails link back with #...type=recovery. Read it before the client consumes and
// clears the URL hash, so the app reliably shows "Set new password" even if the auth event fires early.
export const openedFromRecoveryLink = /[#&?]type=recovery\b/.test(window.location.hash + window.location.search)

/** Error from an expired or already-used email link (e.g. "Email link is invalid or has expired"). */
export const authLinkError = (() => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const msg = params.get('error_description')
  return msg ? msg.replace(/\+/g, ' ') : null
})()

/**
 * Refresh token handed over from the old address (see domainRedirect.ts). Taken out of the URL
 * right away so it doesn't linger in the address bar or history; AuthProvider uses it to sign in.
 */
export const migratedRefreshToken = (() => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const token = params.get(MIGRATE_PARAM)
  if (!token) return null
  params.delete(MIGRATE_PARAM)
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''))
  return token
})()

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
