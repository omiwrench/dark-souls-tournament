import type { ClientMessage, MatchEvent, ServerMessage } from '@dst/shared'

type MatchHandler = (events: MatchEvent[]) => void
type Listener = () => void

/**
 * One WebSocket per tab, shared by every screen. Reconnects on its own and re-subscribes,
 * asking each match for the events after the last one it has (`sinceSeq`).
 */
class LiveSocket {
  private ws: WebSocket | null = null
  private retryMs = 1_000
  private matchHandlers = new Map<string, { sinceSeq: () => number; handlers: Set<MatchHandler> }>()
  private listHandlers = new Set<Listener>()
  private statusListeners = new Set<Listener>()

  /** Server time minus local time, from the last `hello`. */
  serverOffsetMs = 0
  connected = false

  /** Current time on the server's clock (epoch ms). */
  serverNow() {
    return Date.now() + this.serverOffsetMs
  }

  subscribeMatch(id: string, sinceSeq: () => number, handler: MatchHandler) {
    let entry = this.matchHandlers.get(id)
    if (!entry) {
      entry = { sinceSeq, handlers: new Set() }
      this.matchHandlers.set(id, entry)
      this.send({ type: 'subscribe', topic: 'match', id, sinceSeq: sinceSeq() })
    }
    entry.handlers.add(handler)
    this.ensureConnected()
    return () => {
      entry.handlers.delete(handler)
      if (entry.handlers.size > 0) return
      this.matchHandlers.delete(id)
      this.send({ type: 'unsubscribe', topic: 'match', id })
    }
  }

  /** Called whenever the match list changes. */
  subscribeMatchList(listener: Listener) {
    if (this.listHandlers.size === 0) this.send({ type: 'subscribe', topic: 'matches' })
    this.listHandlers.add(listener)
    this.ensureConnected()
    return () => {
      this.listHandlers.delete(listener)
      if (this.listHandlers.size === 0) this.send({ type: 'unsubscribe', topic: 'matches' })
    }
  }

  onStatusChange(listener: Listener) {
    this.statusListeners.add(listener)
    return () => void this.statusListeners.delete(listener)
  }

  private ensureConnected() {
    if (this.ws) return
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)
    this.ws = ws

    ws.onopen = () => {
      this.retryMs = 1_000
      this.setConnected(true)
      for (const [id, entry] of this.matchHandlers) {
        this.send({ type: 'subscribe', topic: 'match', id, sinceSeq: entry.sinceSeq() })
      }
      if (this.listHandlers.size) this.send({ type: 'subscribe', topic: 'matches' })
    }
    ws.onmessage = (event) => this.handle(JSON.parse(event.data) as ServerMessage)
    ws.onclose = () => {
      this.ws = null
      this.setConnected(false)
      setTimeout(() => this.ensureConnected(), this.retryMs)
      this.retryMs = Math.min(this.retryMs * 2, 10_000)
    }
  }

  private handle(message: ServerMessage) {
    switch (message.type) {
      case 'hello':
        this.serverOffsetMs = message.serverNow - Date.now()
        break
      case 'match.events':
        for (const handler of this.matchHandlers.get(message.matchId)?.handlers ?? []) {
          handler(message.events)
        }
        break
      case 'matches.changed':
        for (const listener of this.listHandlers) listener()
        break
      case 'error':
        console.warn('Live update error:', message.code, message.message)
        break
    }
  }

  private send(message: ClientMessage) {
    // When not connected, `onopen` sends all subscriptions anyway.
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  private setConnected(connected: boolean) {
    this.connected = connected
    for (const listener of this.statusListeners) listener()
  }
}

export const liveSocket = new LiveSocket()
