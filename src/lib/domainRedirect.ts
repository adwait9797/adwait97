/**
 * Moves people from the old address to the custom domain without logging them out.
 *
 * Logins live in localStorage, which is per-domain, so a plain server redirect would drop them.
 * Instead, on the old host the app reads the saved Supabase session and sends only its refresh
 * token to the new domain in the URL fragment (never sent to any server). The new domain picks it
 * up in supabase.ts, removes it from the address bar, and restores the session.
 *
 * This file must not import the Supabase client: on the old host the client is never created,
 * so it can't refresh (rotate) the token we're handing over.
 */

export const CANONICAL_ORIGIN = 'https://gymbuddies.ak97.in'
const OLD_HOSTS = ['adwait97.vercel.app']
export const MIGRATE_PARAM = 'gb_session'

function storageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return null
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}

function savedRefreshToken(): string | null {
  const key = storageKey()
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    const token = raw ? (JSON.parse(raw) as { refresh_token?: unknown }).refresh_token : null
    return typeof token === 'string' && token ? token : null
  } catch {
    return null
  }
}

/** True when this page load is leaving for the custom domain (don't start the app). */
export const redirectingToCanonical = (() => {
  if (!OLD_HOSTS.includes(window.location.hostname)) return false
  const { pathname, search, hash } = window.location
  const token = savedRefreshToken()
  // Keep any existing fragment (e.g. a password-reset link) and add the session handover to it.
  const fragment = [hash.replace(/^#/, ''), token ? `${MIGRATE_PARAM}=${encodeURIComponent(token)}` : '']
    .filter(Boolean)
    .join('&')
  window.location.replace(`${CANONICAL_ORIGIN}${pathname}${search}${fragment ? `#${fragment}` : ''}`)
  return true
})()
