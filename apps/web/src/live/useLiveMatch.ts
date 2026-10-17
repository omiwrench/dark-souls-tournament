import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type Command,
  type CommandResponse,
  type MatchDetail,
  type MatchEvent,
  reduceMatch,
} from '@dst/shared'
import { api } from '../api/client'
import { mergeEvents } from './merge'
import { liveSocket } from './socket'

/**
 * Loads a match, keeps it in sync over the WebSocket, and computes its state with the
 * shared reducer. `send` runs a host command and resolves with the new events.
 * Mount it with a `key` per match id, so switching matches starts from a clean slate.
 */
export function useLiveMatch(id: string) {
  const query = useQuery({
    queryKey: ['match', id],
    queryFn: () => api<MatchDetail>('GET', `/matches/${id}`),
    // Live events keep it current; refetch only on a gap or reconnect problems.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const { data: detail, refetch } = query

  // Events received after the initial load. Duplicates are skipped when combining.
  const [liveEvents, setLiveEvents] = useState<MatchEvent[]>([])
  const events = useMemo(
    () => (detail ? (mergeEvents(detail.events, liveEvents) ?? detail.events) : []),
    [detail, liveEvents],
  )

  // The newest events we know of, for callbacks. Kept ahead of renders by `receive`.
  const eventsRef = useRef<MatchEvent[]>([])
  useEffect(() => {
    if (events.length > eventsRef.current.length) eventsRef.current = events
  }, [events])

  const receive = useCallback(
    (incoming: MatchEvent[]) => {
      const merged = mergeEvents(eventsRef.current, incoming)
      if (!merged) {
        // We missed something: start over from the server's full list.
        setLiveEvents([])
        eventsRef.current = []
        void refetch()
        return
      }
      eventsRef.current = merged
      setLiveEvents((current) => [...current, ...incoming])
    },
    [refetch],
  )

  const loaded = detail !== undefined
  useEffect(() => {
    if (!loaded) return
    return liveSocket.subscribeMatch(id, () => eventsRef.current.at(-1)?.seq ?? 0, receive)
  }, [id, loaded, receive])

  const state = useMemo(
    () => detail && reduceMatch({ ruleset: detail.ruleset, players: detail.players }, events),
    [detail, events],
  )

  const send = useCallback(
    async (command: Command) => {
      const res = await api<CommandResponse>('POST', `/matches/${id}/commands`, command)
      // Apply right away instead of waiting for the WebSocket echo.
      receive(res.events)
      return res.events
    },
    [id, receive],
  )

  return { detail, state, send, error: query.error }
}
