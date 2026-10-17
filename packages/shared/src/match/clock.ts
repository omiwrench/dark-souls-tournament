/**
 * The match clock never ticks. It's a few timestamps from which anyone can compute the
 * current match time. All timestamps are epoch milliseconds.
 */
export type Clock = {
  /** When the clock starts, i.e. after the countdown. `null` before the match is started. */
  startsAt: number | null
  /** When the clock last started running. `null` while paused or stopped. */
  runningSince: number | null
  /** Match time accumulated before `runningSince`. */
  elapsedBeforeMs: number
  limitMs: number | null
}

export function initialClock(limitMs: number | null): Clock {
  return { startsAt: null, runningSince: null, elapsedBeforeMs: 0, limitMs }
}

function unclampedMatchTime(clock: Clock, now: number): number {
  if (clock.runningSince === null) return clock.elapsedBeforeMs
  return clock.elapsedBeforeMs + Math.max(0, now - clock.runningSince)
}

/** Current match time in ms, never beyond the time limit. */
export function matchTime(clock: Clock, now: number): number {
  const ms = unclampedMatchTime(clock, now)
  return clock.limitMs === null ? ms : Math.min(ms, clock.limitMs)
}

/** Time left before the limit, or `null` without a limit. */
export function remainingTime(clock: Clock, now: number): number | null {
  return clock.limitMs === null ? null : clock.limitMs - matchTime(clock, now)
}

export function isCountingDown(clock: Clock, now: number): boolean {
  return clock.startsAt !== null && now < clock.startsAt
}

/**
 * Wall-clock ms until the time limit is reached, for scheduling the expiry timer.
 * `null` when there's no limit or the clock isn't running. 0 when already due.
 */
export function msUntilExpiry(clock: Clock, now: number): number | null {
  if (clock.limitMs === null || clock.runningSince === null) return null
  // `runningSince` can be in the future during the countdown, which this accounts for.
  return Math.max(0, clock.limitMs - clock.elapsedBeforeMs - (now - clock.runningSince))
}
