import { isLosslessNumber, parseLossless } from './lossless'

export function looksLikeJson(str: string): boolean {
  const t = str.trim()
  return (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']'))
  )
}

export function parseNested(
  str: string,
  { maxLength = Infinity }: { maxLength?: number } = {},
): object | null {
  if (str.length > maxLength || !looksLikeJson(str)) return null
  try {
    const value = parseLossless(str)
    return typeof value === 'object' &&
      value !== null &&
      !isLosslessNumber(value)
      ? value
      : null
  } catch {
    return null
  }
}
