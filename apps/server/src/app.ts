import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { APP_NAME } from '@dst/shared'

export type AppOptions = {
  logger?: boolean
  /** Directory with the built web app. Served when it exists (i.e. in production). */
  webDistDir?: string
}

const defaultWebDistDir = fileURLToPath(new URL('../../web/dist', import.meta.url))

export async function buildApp({
  logger = false,
  webDistDir = defaultWebDistDir,
}: AppOptions = {}) {
  const app = Fastify({ logger })

  app.get('/api/health', async () => ({
    status: 'ok',
    name: APP_NAME,
    serverTime: new Date().toISOString(),
  }))

  if (existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir })
    // Single-page app: unknown non-API paths get index.html so client-side routing works.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'Not found' })
    })
  }

  return app
}
