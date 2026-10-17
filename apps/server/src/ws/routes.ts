import type { FastifyInstance } from 'fastify'
import { ClientMessageSchema, type ServerMessage } from '@dst/shared'
import type { MatchService } from '../services/match-service'
import type { Hub } from './hub'

export function wsRoutes(
  app: FastifyInstance,
  { hub, matches, now }: { hub: Hub; matches: MatchService; now: () => number },
) {
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message))
    send({ type: 'hello', serverNow: now() })

    socket.on('message', (raw) => {
      let json: unknown
      try {
        json = JSON.parse(raw.toString())
      } catch {
        return send({ type: 'error', code: 'invalid_message', message: 'Not JSON' })
      }
      const parsed = ClientMessageSchema.safeParse(json)
      if (!parsed.success) {
        return send({ type: 'error', code: 'invalid_message', message: 'Unknown message' })
      }
      const message = parsed.data

      if (message.topic === 'matches') {
        if (message.type === 'subscribe') hub.subscribe(socket, 'matches')
        else hub.unsubscribe(socket, 'matches')
        return
      }
      if (message.type === 'unsubscribe') return hub.unsubscribe(socket, `match:${message.id}`)

      // Subscribing and catching up happen in the same synchronous step, so no event
      // can slip in between them.
      const events = matches.eventsSince(message.id, message.sinceSeq)
      if (!events) return send({ type: 'error', code: 'not_found', message: 'Match not found' })
      hub.subscribe(socket, `match:${message.id}`)
      send({ type: 'match.events', matchId: message.id, events })
    })

    socket.on('close', () => hub.remove(socket))
  })
}
