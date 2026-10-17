import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { ServerMessage } from '@dst/shared'
import { command, createMatch, testApp } from '../test/helpers'

let app: FastifyInstance
afterEach(() => app.close())

/** Connects and returns a function that waits for the next message. */
async function connect(app: FastifyInstance) {
  const queue: ServerMessage[] = []
  const waiters: ((m: ServerMessage) => void)[] = []
  await app.ready()
  // Listen from the very start, or the server's hello is lost.
  const socket = await app.injectWS(
    '/ws',
    {},
    {
      onInit: (ws) =>
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as ServerMessage
          const waiter = waiters.shift()
          if (waiter) waiter(message)
          else queue.push(message)
        }),
    },
  )
  const next = (step = '') =>
    new Promise<ServerMessage>((resolve, reject) => {
      const queued = queue.shift()
      if (queued) return resolve(queued)
      waiters.push(resolve)
      setTimeout(
        () => reject(new Error(`No message at ${step}; queue=${JSON.stringify(queue)}`)),
        1_000,
      )
    })
  const send = (message: object) => socket.send(JSON.stringify(message))
  return { socket, next, send }
}

describe('WebSocket', () => {
  it('says hello, catches up and pushes new events', async () => {
    app = await testApp()
    const { id } = await createMatch(app)
    await command(app, id, { type: 'start', countdownMs: 0 })

    const ws = await connect(app)
    expect(await ws.next('hello')).toMatchObject({ type: 'hello', serverNow: expect.any(Number) })

    ws.send({ type: 'subscribe', topic: 'match', id, sinceSeq: 0 })
    const catchUp = await ws.next('catch-up')
    expect(catchUp).toMatchObject({ type: 'match.events', matchId: id })
    expect(catchUp.type === 'match.events' && catchUp.events.map((e) => e.seq)).toEqual([1])

    ws.send({ type: 'subscribe', topic: 'matches' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect((await command(app, id, { type: 'endMatch' })).statusCode).toBe(200)
    const pushed = await ws.next('pushed')
    expect(pushed.type === 'match.events' && pushed.events.map((e) => e.body.type)).toEqual([
      'match.endedByHost',
    ])
    expect(await ws.next('changed')).toEqual({ type: 'matches.changed' })
    ws.socket.terminate()
  })

  it('reports unknown matches and bad messages', async () => {
    app = await testApp()
    const ws = await connect(app)
    await ws.next()
    ws.send({ type: 'subscribe', topic: 'match', id: 'nope' })
    expect(await ws.next()).toMatchObject({ type: 'error', code: 'not_found' })
    ws.socket.send('garbage')
    expect(await ws.next()).toMatchObject({ type: 'error', code: 'invalid_message' })
    ws.socket.terminate()
  })
})
