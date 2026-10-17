import type { ServerMessage } from '@dst/shared'

/** The bit of a WebSocket the hub needs, so tests can use fakes. */
export type Subscriber = { send(data: string): void }

export type Topic = `match:${string}` | 'matches'

/**
 * Keeps track of which sockets listen to which topics, in memory. Works because there is
 * exactly one server process (see tech spec §11).
 */
export class Hub {
  private topics = new Map<Topic, Set<Subscriber>>()

  subscribe(subscriber: Subscriber, topic: Topic) {
    let subscribers = this.topics.get(topic)
    if (!subscribers) this.topics.set(topic, (subscribers = new Set()))
    subscribers.add(subscriber)
  }

  unsubscribe(subscriber: Subscriber, topic: Topic) {
    const subscribers = this.topics.get(topic)
    subscribers?.delete(subscriber)
    if (subscribers?.size === 0) this.topics.delete(topic)
  }

  /** Removes a closed socket from every topic. */
  remove(subscriber: Subscriber) {
    for (const topic of [...this.topics.keys()]) this.unsubscribe(subscriber, topic)
  }

  publish(topic: Topic, message: ServerMessage) {
    const data = JSON.stringify(message)
    for (const subscriber of this.topics.get(topic) ?? []) subscriber.send(data)
  }
}
