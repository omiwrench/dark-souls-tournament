import { describe, expect, it } from 'vitest'
import { formatMatchTime, parseMatchTime } from './time'

describe('formatMatchTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatMatchTime(0)).toBe('0:00')
    expect(formatMatchTime(59_999)).toBe('0:59')
    expect(formatMatchTime(61_000)).toBe('1:01')
  })

  it('includes hours from one hour', () => {
    expect(formatMatchTime(90 * 60_000)).toBe('1:30:00')
  })

  it('clamps negative values to zero', () => {
    expect(formatMatchTime(-5_000)).toBe('0:00')
  })
})

describe('parseMatchTime', () => {
  it('parses the formats a host types', () => {
    expect(parseMatchTime('12')).toBe(12 * 60_000)
    expect(parseMatchTime('1:05')).toBe(65_000)
    expect(parseMatchTime(' 85:00 ')).toBe(85 * 60_000)
    expect(parseMatchTime('1:02:03')).toBe(3_723_000)
  })

  it('rejects nonsense', () => {
    for (const input of ['', 'abc', '1:60', '1:60:00', '1:2:3:4', '-1']) {
      expect(parseMatchTime(input)).toBeNull()
    }
  })
})
