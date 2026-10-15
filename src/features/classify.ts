import { isLosslessNumber } from './lossless'

export type DateHint = { kind: 'date'; date: Date; dateOnly: boolean }

const SECONDS_MIN = 946684800 // 2000-01-01T00:00:00Z
const SECONDS_MAX = 4102444800 // 2100-01-01T00:00:00Z
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/

export function classifyDate(value: unknown): DateHint | null {
  const n = isLosslessNumber(value) ? value.parsedValue : value
  if (typeof n === 'number') {
    if (n >= SECONDS_MIN && n <= SECONDS_MAX) return dateHint(n * 1000, false)
    if (n >= SECONDS_MIN * 1000 && n <= SECONDS_MAX * 1000) {
      return dateHint(n, false)
    }
    return null
  }
  if (typeof n !== 'string') return null
  const m = ISO.exec(n)
  if (!m) return null
  const [, y, mo, d, time] = m
  const day = new Date(Date.UTC(+y, +mo - 1, +d))
  if (day.getUTCMonth() !== +mo - 1 || day.getUTCDate() !== +d) return null
  if (!time) return { kind: 'date', date: day, dateOnly: true }
  const ms = Date.parse(n.replace(' ', 'T').toUpperCase())
  return Number.isNaN(ms) ? null : dateHint(ms, false)
}

const dateHint = (ms: number, dateOnly: boolean): DateHint => ({
  kind: 'date',
  date: new Date(ms),
  dateOnly,
})

export function formatLocal(
  date: Date,
  {
    locale,
    timeZone,
    dateOnly = false,
  }: { locale?: string; timeZone?: string; dateOnly?: boolean } = {},
): string {
  return dateOnly
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(date)
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'long',
        timeZone,
      }).format(date)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

export function formatRelative(
  date: Date,
  now: number,
  { locale, dateOnly = false }: { locale?: string; dateOnly?: boolean } = {},
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (dateOnly) {
    const n = new Date(now)
    const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
    return rtf.format(Math.round((date.getTime() - today) / 86400e3), 'day')
  }
  const diff = (date.getTime() - now) / 1000
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds || unit === 'second') {
      return rtf.format(Math.round(diff / seconds), unit)
    }
  }
  return rtf.format(0, 'second')
}
