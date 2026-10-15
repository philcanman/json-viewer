import { describe, expect, it } from 'vitest'
import {
  classify,
  classifyColor,
  classifyDate,
  classifyJwt,
  formatLocal,
  formatRelative,
  rgbText,
} from './classify'
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

describe('classifyColor', () => {
  it.each([
    ['#f80', 'rgb(255, 136, 0)'],
    ['#ff8800', 'rgb(255, 136, 0)'],
    ['#FF8800', 'rgb(255, 136, 0)'],
    ['#ff880080', 'rgba(255, 136, 0, 0.5)'],
    ['#f808', 'rgba(255, 136, 0, 0.53)'],
  ])('%s -> %s', (hex, text) => {
    const hint = classifyColor(hex)
    expect(hint).not.toBeNull()
    expect(rgbText(hint!)).toBe(text)
    expect(hint!.hex).toBe(hex)
  })
  it.each(['ff8800', '#ggg', '#ff88000', '#', 'red', 255])(
    'rejects %j',
    (value) => {
      expect(classifyColor(value)).toBeNull()
    },
  )
})

const b64url = (v: unknown) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString(
    'base64url',
  )
const jwt = (header: unknown, payload: unknown, sig = 'c2ln') =>
  `${b64url(header)}.${b64url(payload)}.${sig}`

describe('classifyJwt', () => {
  const header = { alg: 'HS256', typ: 'JWT' }
  it('decodes header, payload and time claims', () => {
    const token = jwt(header, {
      sub: '123',
      name: 'Zoë',
      iat: 1700000000,
      exp: 4102444799,
    })
    expect(classifyJwt(token, NOW)).toEqual({
      kind: 'jwt',
      header,
      payload: { sub: '123', name: 'Zoë', iat: 1700000000, exp: 4102444799 },
      payloadText: JSON.stringify({
        sub: '123',
        name: 'Zoë',
        iat: 1700000000,
        exp: 4102444799,
      }),
      times: [
        { claim: 'exp', date: new Date(4102444799000) },
        { claim: 'iat', date: new Date(1700000000000) },
      ],
      expired: false,
    })
  })
  it('flags expired tokens', () => {
    expect(classifyJwt(jwt(header, { exp: 1700000000 }), NOW)?.expired).toBe(
      true,
    )
  })
  it('keeps non-JSON payload text', () => {
    expect(classifyJwt(jwt(header, 'hello'), NOW)).toMatchObject({
      payload: null,
      payloadText: 'hello',
    })
  })
  it('accepts an empty signature', () => {
    expect(classifyJwt(jwt(header, {}, ''), NOW)).not.toBeNull()
  })
  it.each([
    ['a.b.c'],
    [jwt({ typ: 'JWT' }, {})],
    [jwt('not json', {})],
    [jwt(header, { pad: 'x'.repeat(70000) })],
    ['abc'],
  ])('rejects %#', (token) => {
    expect(classifyJwt(token, NOW)).toBeNull()
  })
})

describe('classify', () => {
  it('dispatches to the right hint', () => {
    expect(classify(1700000000, NOW)?.kind).toBe('date')
    expect(classify('#fff', NOW)?.kind).toBe('color')
    expect(classify(jwt({ alg: 'none' }, { sub: '1' }), NOW)?.kind).toBe('jwt')
    expect(classify('hello', NOW)).toBeNull()
    expect(classify({ a: 1 }, NOW)).toBeNull()
  })
})
