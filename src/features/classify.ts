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

export type ColorHint = {
  kind: 'color'
  hex: string
  r: number
  g: number
  b: number
  a: number | null
}

export type JwtHint = {
  kind: 'jwt'
  header: Record<string, unknown>
  payload: unknown | null
  payloadText: string
  times: { claim: 'exp' | 'iat' | 'nbf'; date: Date }[]
  expired: boolean
}

export type Hint = DateHint | ColorHint | JwtHint

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function classifyColor(value: unknown): ColorHint | null {
  if (typeof value !== 'string') return null
  const m = HEX.exec(value)
  if (!m) return null
  const digits =
    m[1].length <= 4
      ? m[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : m[1]
  const byte = (i: number) => parseInt(digits.slice(i, i + 2), 16)
  return {
    kind: 'color',
    hex: value,
    r: byte(0),
    g: byte(2),
    b: byte(4),
    a: digits.length === 8 ? Math.round((byte(6) / 255) * 100) / 100 : null,
  }
}

export const rgbText = ({ r, g, b, a }: ColorHint): string =>
  a === null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
const JWT_MAX_LENGTH = 65536
const TIME_CLAIMS = ['exp', 'iat', 'nbf'] as const

function decodeSegment(segment: string): string | null {
  try {
    const b64 = segment
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function classifyJwt(value: unknown, now: number): JwtHint | null {
  if (
    typeof value !== 'string' ||
    value.length > JWT_MAX_LENGTH ||
    !JWT.test(value)
  ) {
    return null
  }
  const [h, p] = value.split('.')
  const headerText = decodeSegment(h)
  const header = headerText === null ? null : parseJson(headerText)
  if (
    typeof header !== 'object' ||
    header === null ||
    Array.isArray(header) ||
    typeof (header as { alg?: unknown }).alg !== 'string'
  ) {
    return null
  }
  const payloadText = decodeSegment(p)
  if (payloadText === null) return null
  const payload = parseJson(payloadText)
  const claims =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {}
  const times = TIME_CLAIMS.filter((c) => typeof claims[c] === 'number').map(
    (claim) => ({ claim, date: new Date((claims[claim] as number) * 1000) }),
  )
  const exp = claims.exp
  return {
    kind: 'jwt',
    header: header as Record<string, unknown>,
    payload,
    payloadText,
    times,
    expired: typeof exp === 'number' && exp * 1000 < now,
  }
}

export function classify(value: unknown, now: number): Hint | null {
  return classifyColor(value) ?? classifyJwt(value, now) ?? classifyDate(value)
}
