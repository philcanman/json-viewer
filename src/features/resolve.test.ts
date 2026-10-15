import { describe, expect, it } from 'vitest'
import { parseLossless } from './lossless'
import { resolve } from './resolve'

const many = Array.from({ length: 150 }, (_, i) => i)
const huge = Array.from({ length: 10001 }, (_, i) => i)
const data = parseLossless(
  JSON.stringify({
    items: [{ name: 'a' }],
    'a/b': 1,
    many,
    huge,
    obj: { '[0…99]': 'lit' },
    str: 'text',
  }).replace('"str"', '"n":12345678901234567890,"str"'),
)

describe('resolve', () => {
  it('walks objects and arrays and reports index steps', () => {
    expect(resolve(data, ['items', '0', 'name'])).toEqual({
      found: true,
      value: 'a',
      steps: [
        { key: 'items', isIndex: false },
        { key: '0', isIndex: true },
        { key: 'name', isIndex: false },
      ],
    })
  })
  it('skips a bucket segment inside an array', () => {
    expect(resolve(data, ['many', '[100…149]', '120'])).toMatchObject({
      found: true,
      value: 120,
      steps: [
        { key: 'many', isIndex: false },
        { key: '120', isIndex: true },
      ],
    })
  })
  it('skips nested buckets', () => {
    expect(resolve(data, ['huge', '[0…9999]', '[0…99]', '42'])).toMatchObject({
      found: true,
      value: 42,
    })
  })
  it('does not resolve a bucket row itself', () => {
    expect(resolve(data, ['many', '[0…99]'])).toEqual({ found: false })
  })
  it('treats bucket-looking keys on objects as real keys', () => {
    expect(resolve(data, ['obj', '[0…99]'])).toMatchObject({
      found: true,
      value: 'lit',
    })
  })
  it('handles keys containing a slash', () => {
    expect(resolve(data, ['a/b'])).toMatchObject({ found: true, value: 1 })
  })
  it.each([
    [['nope']],
    [['items', '5']],
    [['items', 'x']],
    [['str', 'length']],
    [['n', 'source']],
  ])('returns not found for %j', (segments) => {
    expect(resolve(data, segments)).toEqual({ found: false })
  })
  it('resolves an own __proto__ key', () => {
    expect(
      resolve(parseLossless('{"__proto__":{"x":1}}'), ['__proto__', 'x']),
    ).toMatchObject({ found: true, value: 1 })
  })
  it('resolves the root for no segments', () => {
    expect(resolve(data, [])).toMatchObject({ found: true, steps: [] })
  })
})
