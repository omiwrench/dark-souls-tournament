import type { ApiError } from '@dst/shared'

/** A failed API call, carrying the server's error code (e.g. `limit_reached`). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ApiError['error']['issues'],
  ) {
    super(message)
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (json as ApiError | null)?.error
    throw new ApiRequestError(
      res.status,
      error?.code ?? 'unknown',
      error?.message ?? `Request failed (${res.status})`,
      error?.issues,
    )
  }
  return json as T
}
