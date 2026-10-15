import { isLosslessNumber } from './lossless'
import { PathStep } from './path'

const BUCKET = /^\[\d+…\d+\]$/

export type Resolution =
  { found: true; value: unknown; steps: PathStep[] } | { found: false }

export function resolve(data: unknown, segments: string[]): Resolution {
  let value = data
  const steps: PathStep[] = []
  let lastWasBucket = false
  for (const seg of segments) {
    lastWasBucket = false
    if (Array.isArray(value)) {
      if (BUCKET.test(seg)) {
        lastWasBucket = true
        continue
      }
      if (!/^\d+$/.test(seg) || Number(seg) >= value.length) {
        return { found: false }
      }
      steps.push({ key: seg, isIndex: true })
      value = value[Number(seg)]
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !isLosslessNumber(value) &&
      Object.prototype.hasOwnProperty.call(value, seg)
    ) {
      steps.push({ key: seg, isIndex: false })
      value = (value as Record<string, unknown>)[seg]
    } else {
      return { found: false }
    }
  }
  return lastWasBucket ? { found: false } : { found: true, value, steps }
}
