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
