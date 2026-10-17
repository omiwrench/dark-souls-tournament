import { useEffect, useMemo, useRef, useState } from 'react'
import type { DerivedCallout } from '@dst/shared'
import s from './host.module.css'

const SHOW_MS = 4_000
const DRINK_ICON = { sip: '🍺', shot: '🥃', finish: '🍻' } as const

/** Stable keys: the source event plus the callout's position among that event's callouts. */
function keyed(callouts: DerivedCallout[]) {
  const perSource = new Map<number, number>()
  return callouts.map((callout) => {
    const index = perSource.get(callout.sourceSeq) ?? 0
    perSource.set(callout.sourceSeq, index + 1)
    return { key: `${callout.sourceSeq}:${index}:${callout.text}`, callout }
  })
}

/**
 * Shows new callouts one at a time in a big banner. Callouts that existed when the page
 * opened are not replayed, and callouts that get undone before their turn are skipped.
 */
export function CalloutBanner({ callouts }: { callouts: DerivedCallout[] }) {
  const current = useMemo(() => keyed(callouts), [callouts])
  const seen = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<{ key: string; callout: DerivedCallout }[]>([])

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(current.map((c) => c.key))
      return
    }
    const fresh = current.filter((c) => !seen.current!.has(c.key))
    if (!fresh.length) return
    for (const c of fresh) seen.current.add(c.key)
    setQueue((q) => [...q, ...fresh])
  }, [current])

  const currentKeys = new Set(current.map((c) => c.key))
  const visible = queue.filter((c) => currentKeys.has(c.key))
  const showing = visible[0]

  useEffect(() => {
    if (!showing) return
    const timer = setTimeout(() => setQueue((q) => q.filter((c) => c.key !== showing.key)), SHOW_MS)
    return () => clearTimeout(timer)
  }, [showing])

  if (!showing) return null
  const { callout } = showing
  return (
    <div className={s.calloutBanner} role="status" key={showing.key}>
      <div className={s.calloutText}>
        {callout.drinks && <span aria-hidden>{DRINK_ICON[callout.drinks.kind]} </span>}
        {callout.text}
      </div>
      {visible.length > 1 && <div className={s.calloutMore}>+{visible.length - 1} more</div>}
    </div>
  )
}
