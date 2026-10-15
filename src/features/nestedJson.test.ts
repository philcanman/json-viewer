import { describe, expect, it } from 'vitest'
import { isLosslessNumber } from './lossless'
import { looksLikeJson, parseNested } from './nestedJson'

describe('looksLikeJson', () => {
  it.each([
    ['{"a":1}', true],
    ['  [1]\n', true],
    ['{', false],
    ['"x"', false],
    ['123', false],
    ['', false],
  ])('%j -> %s', (str, expected) => {
    expect(looksLikeJson(str)).toBe(expected)
  })
})

describe('parseNested', () => {
  it('parses objects and arrays', () => {
    expect(parseNested('{"a":1}')).toEqual({ a: 1 })
    expect(parseNested(' [1,2] ')).toEqual([1, 2])
  })
  it.each(['"x"', '123', 'true', '{bad}', '[1,]'])('rejects %j', (str) => {
    expect(parseNested(str)).toBeNull()
  })
  it('respects maxLength', () => {
    expect(parseNested('{"a":1}', { maxLength: 3 })).toBeNull()
  })
  it('keeps big numbers lossless', () => {
    const v = parseNested('{"n":12345678901234567890}') as { n: unknown }
    expect(isLosslessNumber(v.n)).toBe(true)
  })
})
