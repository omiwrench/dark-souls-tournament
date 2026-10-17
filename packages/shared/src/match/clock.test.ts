import { describe, expect, it } from 'vitest'
import { type Clock, isCountingDown, matchTime, msUntilExpiry, remainingTime } from './clock'

const clock = (overrides: Partial<Clock>): Clock => ({
  startsAt: 1_000,
  runningSince: 1_000,
  elapsedBeforeMs: 0,
  limitMs: 10_000,
  ...overrides,
})

describe('clock', () => {
  it('is zero before the start and during the countdown', () => {
    const c = clock({})
    expect(matchTime(c, 500)).toBe(0)
    expect(isCountingDown(c, 500)).toBe(true)
    expect(isCountingDown(c, 1_000)).toBe(false)
  })

  it('runs from runningSince on top of earlier elapsed time', () => {
    const c = clock({ runningSince: 5_000, elapsedBeforeMs: 2_000 })
    expect(matchTime(c, 6_000)).toBe(3_000)
  })

  it('stands still while paused', () => {
    const c = clock({ runningSince: null, elapsedBeforeMs: 4_000 })
    expect(matchTime(c, 99_999)).toBe(4_000)
    expect(msUntilExpiry(c, 99_999)).toBeNull()
  })

  it('never goes beyond the limit', () => {
    const c = clock({})
    expect(matchTime(c, 50_000)).toBe(10_000)
    expect(remainingTime(c, 50_000)).toBe(0)
    expect(msUntilExpiry(c, 50_000)).toBe(0)
  })

  it('counts the countdown into the time until expiry', () => {
    expect(msUntilExpiry(clock({}), 0)).toBe(11_000)
    expect(msUntilExpiry(clock({}), 4_000)).toBe(7_000)
  })

  it('has no expiry without a limit', () => {
    const c = clock({ limitMs: null })
    expect(matchTime(c, 50_000)).toBe(49_000)
    expect(remainingTime(c, 50_000)).toBeNull()
    expect(msUntilExpiry(c, 50_000)).toBeNull()
  })
})
