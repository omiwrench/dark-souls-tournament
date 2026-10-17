/**
 * Formats a match clock value for display: `m:ss`, or `h:mm:ss` from one hour.
 * Negative values (e.g. remaining time after expiry) are clamped to zero.
 */
export function formatMatchTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${minutes}:${ss}`
}

/**
 * Parses what a host types as a match time: `m:ss`, `h:mm:ss` or plain minutes.
 * Returns ms, or `null` when it isn't a valid time.
 */
export function parseMatchTime(input: string): number | null {
  const parts = input.trim().split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const numbers = parts.map(Number)
  if (numbers.length === 1) return numbers[0]! * 60_000
  const seconds = numbers.at(-1)!
  const minutes = numbers.at(-2)!
  const hours = numbers.length === 3 ? numbers[0]! : 0
  if (seconds >= 60 || (numbers.length === 3 && minutes >= 60)) return null
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}
