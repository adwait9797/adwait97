import { createClient } from '@supabase/supabase-js'

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

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
