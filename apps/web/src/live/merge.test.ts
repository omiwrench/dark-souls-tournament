import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '@dst/shared'
import { mergeEvents } from './merge'

const event = (seq: number): MatchEvent => ({
  seq,
  at: '2026-10-17T18:00:00.000Z',
  matchTimeMs: 0,
  body: { type: 'clock.paused' },
})

describe('mergeEvents', () => {
  it('appends new events in order', () => {
    expect(mergeEvents([event(1)], [event(3), event(2)])?.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('skips events it already has', () => {
    const current = [event(1), event(2)]
    expect(mergeEvents(current, [event(2)])).toBe(current)
  })

  it('reports gaps', () => {
    expect(mergeEvents([event(1)], [event(3)])).toBeNull()
  })
})
