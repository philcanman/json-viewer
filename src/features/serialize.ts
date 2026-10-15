import { isLosslessNumber } from './lossless'

export function copyText(value: unknown): string {
  if (typeof value === 'string') return value
  if (isLosslessNumber(value)) return value.source
  if (Object.is(value, -0)) return '-0'
  if (value === null || typeof value !== 'object') return String(value)
  return JSON.stringify(
    value,
    (_key, v) =>
      isLosslessNumber(v)
        ? JSON.rawJSON(v.source)
        : Object.is(v, -0)
          ? JSON.rawJSON('-0')
          : v,
    2,
  )
}
