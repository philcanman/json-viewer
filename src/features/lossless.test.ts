import { describe, expect, it } from 'vitest'
import { isLosslessNumber, parseLossless } from './lossless'

describe('parseLossless', () => {
  it('wraps numbers that do not round-trip and keeps their source', () => {
    const v = parseLossless('{"big":12345678901234567890,"small":1.5}') as {
      big: unknown
      small: unknown
    }
    expect(isLosslessNumber(v.big)).toBe(true)
    expect((v.big as { source: string }).source).toBe('12345678901234567890')
    expect(v.small).toBe(1.5)
    expect(isLosslessNumber(v.small)).toBe(false)
  })

  it('leaves -0 as a plain number', () => {
    expect(Object.is(parseLossless('-0'), -0)).toBe(true)
  })

  it('does not treat lookalike objects as lossless numbers', () => {
    expect(isLosslessNumber({ type: 'JSON_NUMBER', source: '1' })).toBe(false)
    expect(isLosslessNumber(null)).toBe(false)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseLossless('{bad')).toThrow(SyntaxError)
  })
})
