/** Dates are stored as the user's own calendar day (YYYY-MM-DD), since friends live in different time zones. */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): string {
  return toISODate(new Date())
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday-start week containing `isoDate`, as 7 ISO dates. */
export function weekDates(isoDate: string = today()): string[] {
  const d = parseISODate(isoDate)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return toISODate(x)
  })
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const days = Math.floor(s / 86400)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export function prettyDate(iso: string = today()): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
