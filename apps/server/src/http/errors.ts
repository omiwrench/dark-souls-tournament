import type { FastifyError, FastifyInstance } from 'fastify'
import { type ZodType, z } from 'zod'
import type { ApiError } from '@dst/shared'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`)

/** Validates untrusted input, turning Zod errors into a 400 response. */
export function parse<T extends ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new HttpError(
    400,
    'invalid_request',
    'The request is invalid',
    result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    let body: ApiError
    if (error instanceof HttpError) {
      reply.code(error.statusCode)
      body = { error: { code: error.code, message: error.message, issues: error.issues } }
    } else if (error.statusCode && error.statusCode < 500) {
      // Fastify's own client errors, e.g. malformed JSON.
      reply.code(error.statusCode)
      body = { error: { code: error.code ?? 'bad_request', message: error.message } }
    } else {
      request.log.error(error)
      reply.code(500)
      body = { error: { code: 'internal', message: 'Something went wrong' } }
    }
    return reply.send(body)
  })
}
