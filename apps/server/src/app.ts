import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import { APP_NAME } from '@dst/shared'
import { openDb } from './db/client'
import { seed } from './db/seed'
import { registerErrorHandler } from './http/errors'
import { matchRoutes } from './routes/matches'
import { playerRoutes } from './routes/players'
import { rulesetRoutes } from './routes/rulesets'
import { MatchService } from './services/match-service'
import { Hub } from './ws/hub'
import { wsRoutes } from './ws/routes'

export type AppOptions = {
  /** SQLite file path, or `:memory:` for tests. */
  dbPath: string
  migrationsDir: string
  /** Directory with the built web app. Served when it exists (i.e. in production). */
  webDistDir?: string
  logger?: boolean
  /** Wall clock in epoch ms. Replaceable in tests. */
  now?: () => number
}

export async function buildApp({
  dbPath,
  migrationsDir,
  webDistDir,
  logger = false,
  now = Date.now,
}: AppOptions) {
  const app = Fastify({ logger })
  registerErrorHandler(app)

  const db = openDb(dbPath, migrationsDir)
  seed(db, new Date(now()))
  const hub = new Hub()
  const matches = new MatchService(db, hub, now, app.log)
  app.addHook('onClose', async () => {
    matches.close()
    db.$client.close()
  })

  await app.register(fastifyWebsocket)

  app.get('/api/health', async () => ({
    status: 'ok',
    name: APP_NAME,
    serverTime: new Date(now()).toISOString(),
  }))
  playerRoutes(app, { db, now })
  rulesetRoutes(app, { db, now })
  matchRoutes(app, { matches })
  wsRoutes(app, { hub, matches, now })

  if (webDistDir && existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir })
    // Single-page app: unknown non-API paths get index.html so client-side routing works.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    })
  }

  matches.resumeTimers()
  return app
}
