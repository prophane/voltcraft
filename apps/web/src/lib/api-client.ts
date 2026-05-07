/// <reference types="vite/client" />
const BASE = import.meta.env.VITE_API_URL ?? '/api'

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const hasBody = options.body !== undefined && options.body !== null

  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  let body: unknown = null
  let rawText = ''

  if (isJson) {
    try {
      body = await res.json()
    } catch {
      body = null
    }
  } else {
    rawText = await res.text()
  }

  if (!res.ok) {
    const maybeError = body as {
      error?: { code?: string; message?: string } | string
      code?: string
      message?: string
    } | null
    const fallbackMessage = rawText
      ? `${res.status} ${res.statusText}: ${rawText.slice(0, 160)}`
      : `Request failed (${res.status} ${res.statusText})`

    const nestedError = typeof maybeError?.error === 'object' ? maybeError.error : null
    const stringError = typeof maybeError?.error === 'string' ? maybeError.error : null
    const resolvedMessage = nestedError?.message ?? maybeError?.message ?? stringError ?? fallbackMessage
    const resolvedCode = nestedError?.code ?? maybeError?.code ?? 'UNKNOWN'

    throw new ApiError(
      res.status,
      resolvedCode,
      resolvedMessage,
    )
  }

  const dataWrapper = body as { data?: T } | null
  if (dataWrapper && typeof dataWrapper === 'object' && 'data' in dataWrapper) {
    return dataWrapper.data as T
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export { ApiError }
