import { describe, expect, it } from 'vitest'
import { formatMatchTime } from './time'

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
