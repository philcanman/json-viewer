import { describe, expect, it } from 'vitest'
import { formatPath, parseRowPath, PathStep } from './path'

// Same escaping as Mozilla's TreeView.subPath (TreeView.mjs:168-170)
const subPath = (path: string, key: string) =>
  path + '/' + key.replace(/[\\/]/g, '\\$&')

const k = (key: string): PathStep => ({ key, isIndex: false })
const i = (key: string): PathStep => ({ key, isIndex: true })

describe('parseRowPath', () => {
  it('splits simple paths', () => {
    expect(parseRowPath('/a/b')).toEqual(['a', 'b'])
  })
  it('round-trips keys with slashes, backslashes and empties', () => {
    const keys = ['a/b', 'x\\y', '', '[0…99]', '5', 'trailing/']
    const id = keys.reduce(subPath, '')
    expect(parseRowPath(id)).toEqual(keys)
  })
  it('returns no segments for an empty id', () => {
    expect(parseRowPath('')).toEqual([])
  })
})

describe('formatPath', () => {
  const simple = [k('items'), i('3'), k('name')]
  it.each([
    ['js', 'items[3].name'],
    ['jsonpath', '$.items[3].name'],
    ['jq', '.items[3].name'],
  ] as const)('simple path as %s', (format, expected) => {
    expect(formatPath(simple, format)).toBe(expected)
  })

  const rootArray = [i('0'), k('id')]
  it.each([
    ['js', '[0].id'],
    ['jsonpath', '$[0].id'],
    ['jq', '.[0].id'],
  ] as const)('root array as %s', (format, expected) => {
    expect(formatPath(rootArray, format)).toBe(expected)
  })

  it.each([
    [[k('first-name')], 'js', '["first-name"]'],
    [[k('first-name')], 'jsonpath', "$['first-name']"],
    [[k('first-name')], 'jq', '.["first-name"]'],
    [[k('a'), k('first-name')], 'js', 'a["first-name"]'],
    [[k('a'), k('first-name')], 'jsonpath', "$.a['first-name']"],
    [[k('a'), k('first-name')], 'jq', '.a["first-name"]'],
    [[k("it's")], 'jsonpath', "$['it\\'s']"],
    [[k('back\\slash')], 'jsonpath', "$['back\\\\slash']"],
    [[k('a"b')], 'js', '["a\\"b"]'],
    [[k('$ref')], 'js', '$ref'],
    [[k('$ref')], 'jsonpath', "$['$ref']"],
    [[k('$ref')], 'jq', '.["$ref"]'],
    [[k('')], 'js', '[""]'],
    [[k('')], 'jsonpath', "$['']"],
    [[k('')], 'jq', '.[""]'],
    [[k('0')], 'js', '["0"]'],
    [[k('0')], 'jsonpath', "$['0']"],
    [[k('a/b')], 'js', '["a/b"]'],
    [[k('café')], 'js', '["café"]'],
  ] as const)('%j as %s', (steps, format, expected) => {
    expect(formatPath([...steps], format)).toBe(expected)
  })

  it.each([
    ['js', ''],
    ['jsonpath', '$'],
    ['jq', '.'],
  ] as const)('root as %s', (format, expected) => {
    expect(formatPath([], format)).toBe(expected)
  })
})

describe('formatPath jq keywords', () => {
  it.each([
    [[k('end')], '.["end"]'],
    [[k('a'), k('if')], '.a["if"]'],
    [[k('and'), k('x')], '.["and"].x'],
    [[k('reduce')], '.["reduce"]'],
    [[k('__loc__')], '.["__loc__"]'],
  ] as const)('%j', (steps, expected) => {
    expect(formatPath([...steps], 'jq')).toBe(expected)
  })
  it('leaves non-keywords bare', () => {
    expect(formatPath([k('ending')], 'jq')).toBe('.ending')
  })
})
