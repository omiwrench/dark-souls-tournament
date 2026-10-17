import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const app = await buildApp({ webDistDir: '/nonexistent' })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok' })
    await app.close()
  })
})
