import { describe, expect, it } from 'vitest'
import { normalizePathFormat } from './settings'

describe('normalizePathFormat', () => {
  it.each([
    ['js', 'js'],
    ['jsonpath', 'jsonpath'],
    ['jq', 'jq'],
    ['JQ', 'js'],
    [undefined, 'js'],
    [42, 'js'],
  ])('%j -> %s', (value, expected) => {
    expect(normalizePathFormat(value)).toBe(expected)
  })
})
