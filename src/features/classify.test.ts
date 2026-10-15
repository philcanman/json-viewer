import { describe, expect, it } from 'vitest'
import { classifyDate, formatLocal, formatRelative } from './classify'
import { parseLossless } from './lossless'

const NOW = Date.UTC(2026, 9, 15, 12) // 2026-10-15 12:00 UTC

describe('classifyDate', () => {
  it.each([
    [946684800, 946684800000],
    [1700000000, 1700000000000],
    [4102444800, 4102444800000],
    [1700000000000, 1700000000000],
    [4102444800000, 4102444800000],
  ])('number %d is a date at %d ms', (value, ms) => {
    expect(classifyDate(value)).toEqual({
      kind: 'date',
      date: new Date(ms),
      dateOnly: false,
    })
  })
  it.each([946684799, 4102444801, 1e10, 946684799999, 4102444800001, 42, -1])(
    'number %d is not a date',
    (value) => {
      expect(classifyDate(value)).toBeNull()
    },
  )
  it('uses parsedValue of lossless numbers', () => {
    expect(classifyDate(parseLossless('1700000000.0'))).toMatchObject({
      date: new Date(1700000000000),
    })
  })
  it.each([
    ['2023-11-14T22:13:20Z', Date.UTC(2023, 10, 14, 22, 13, 20)],
    ['2023-11-14T22:13:20.123+05:30', Date.UTC(2023, 10, 14, 16, 43, 20, 123)],
    ['2023-11-14t22:13:20z', Date.UTC(2023, 10, 14, 22, 13, 20)],
  ])('ISO %s', (str, ms) => {
    expect(classifyDate(str)).toEqual({
      kind: 'date',
      date: new Date(ms),
      dateOnly: false,
    })
  })
  it('accepts a space separator and no zone as local time', () => {
    expect(classifyDate('2023-11-14 22:13')).toEqual({
      kind: 'date',
      date: new Date(2023, 10, 14, 22, 13),
      dateOnly: false,
    })
  })
  it('marks date-only strings', () => {
    expect(classifyDate('2026-10-12')).toEqual({
      kind: 'date',
      date: new Date(Date.UTC(2026, 9, 12)),
      dateOnly: true,
    })
  })
  it.each(['2023-13-01', '2023-02-30T10:00Z', 'Nov 14 2023', '20231114', 'x'])(
    'rejects %s',
    (str) => {
      expect(classifyDate(str)).toBeNull()
    },
  )
})

describe('formatLocal', () => {
  it('formats date-time in the given zone', () => {
    expect(
      formatLocal(new Date(1700000000000), {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toMatch(/^Nov 14, 2023, 10:13:20\sPM UTC$/)
  })
  it('formats date-only as the calendar date', () => {
    expect(
      formatLocal(new Date(Date.UTC(2026, 9, 12)), {
        locale: 'en-US',
        dateOnly: true,
      }),
    ).toBe('Oct 12, 2026')
  })
})

describe('formatRelative', () => {
  it.each([
    [NOW - 3 * 86400e3, '3 days ago'],
    [NOW + 2 * 3600e3, 'in 2 hours'],
    [NOW - 2 * 365 * 86400e3, '2 years ago'],
    [NOW, 'now'],
  ])('%d -> %s', (ms, expected) => {
    expect(formatRelative(new Date(ms), NOW, { locale: 'en-US' })).toBe(
      expected,
    )
  })
  it('counts days for date-only values', () => {
    expect(
      formatRelative(new Date(Date.UTC(2026, 9, 12)), NOW, {
        locale: 'en-US',
        dateOnly: true,
      }),
    ).toBe('3 days ago')
  })
})
