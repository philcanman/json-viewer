import { JSON_NUMBER } from 'devtools/client/shared/components/reps/reps/constants.mjs'
import { parseJsonLossless } from 'devtools/client/shared/components/reps/reps/rep-utils.mjs'

export interface LosslessNumber {
  type: symbol
  source: string
  parsedValue: number
}

export const isLosslessNumber = (v: unknown): v is LosslessNumber =>
  typeof v === 'object' &&
  v !== null &&
  (v as { type?: unknown }).type === JSON_NUMBER

export const parseLossless: (text: string) => unknown = parseJsonLossless
