import { describe, expect, it } from 'vitest'
import { parseLossless } from './lossless'
import { copyText } from './serialize'

describe('copyText', () => {
  it.each([
    ['a"b', 'a"b'],
    [1.5, '1.5'],
    [-0, '-0'],
    [true, 'true'],
    [null, 'null'],
  ])('%j copies as %s', (value, expected) => {
    expect(copyText(value)).toBe(expected)
  })
  it('copies lossless numbers by source', () => {
    expect(copyText(parseLossless('12345678901234567890'))).toBe(
      '12345678901234567890',
    )
  })
  it('pretty-prints objects keeping lossless numbers and -0', () => {
    const value = parseLossless('{"a":[1,12345678901234567890,-0],"b":"x"}')
    expect(copyText(value)).toBe(
      '{\n  "a": [\n    1,\n    12345678901234567890,\n    -0\n  ],\n  "b": "x"\n}',
    )
  })
})
