import type { MatchEvent } from '@dst/shared'

/**
 * Appends incoming events to the ones we have. Events we already have are skipped.
 * Returns `null` on a gap in `seq`, meaning the caller should refetch the whole match.
 */
export function mergeEvents(current: MatchEvent[], incoming: MatchEvent[]): MatchEvent[] | null {
  let merged = current
  for (const event of [...incoming].sort((a, b) => a.seq - b.seq)) {
    const lastSeq = merged.at(-1)?.seq ?? 0
    if (event.seq <= lastSeq) continue
    if (event.seq !== lastSeq + 1) return null
    merged = [...merged, event]
  }
  return merged
}
