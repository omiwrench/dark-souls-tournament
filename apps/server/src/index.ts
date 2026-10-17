import { fileURLToPath } from 'node:url'
import { buildApp } from './app'

// Paths relative to this file work both for src/index.ts (dev) and dist/index.js (built).
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const app = await buildApp({
  dbPath: process.env.DATABASE_PATH ?? fromHere('../../../data/tournament.db'),
  migrationsDir: fromHere('../drizzle'),
  webDistDir: fromHere('../../web/dist'),
  logger: true,
})

await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
})

// Close cleanly (stops timers, closes the database) on Ctrl+C and container shutdown.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void app.close().then(() => process.exit(0)))
}
