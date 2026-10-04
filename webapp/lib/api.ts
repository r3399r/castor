import { auth } from '@/lib/firebase'
import { version } from '../package.json'

const LIMIT = 20

type Params = Record<string, string | number | undefined>

function getStoredToken(): string {
  if (typeof sessionStorage === 'undefined') return 'NO_AUTH'
  return sessionStorage.getItem('idToken') ?? 'NO_AUTH'
}

async function forceRefreshToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  const token = await user.getIdToken(true)
  sessionStorage.setItem('idToken', token)
  return token
}

function buildUrl(path: string, params?: Params): string {
  const base = `/api/${path}`
  if (!params) return base
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v!))}`)
    .join('&')
  return qs ? `${base}?${qs}` : base
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Carries the status and the backend's error `code` through to the caller.
 *
 * `message` keeps the old `API <status>: <url>` shape on purpose -- a
 * couple of screens render it verbatim, and callers that only ever needed
 * the status keep working untouched.
 */
class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, url: string, code?: string) {
    super(`API ${status}: ${url}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Pulls the backend's error `code` off a failed response.
 *
 * The backend answers every thrown error with `{status, name, message,
 * code}`, and `code` is the only thing separating an overloaded AI
 * provider from a malformed AI reply -- both of which arrive as a bare
 * 502. Swallowing a parse failure is deliberate: CloudFront and API
 * Gateway can answer with HTML before the Lambda is ever reached, and
 * crashing while handling an error is worse than losing the code.
 */
async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { code?: unknown }
    return typeof body.code === 'string' ? body.code : undefined
  } catch {
    return undefined
  }
}

async function request<T>(url: string, init: RequestInit, token?: string): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: token ?? getStoredToken(),
    'x-api-version': version,
  }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 && !token) {
    const newToken = await forceRefreshToken()
    if (newToken) {
      const retry = await fetch(url, { ...init, headers: { ...headers, Authorization: newToken } })
      if (!retry.ok) throw new ApiError(retry.status, url, await readErrorCode(retry))
      return parseResponse<T>(retry)
    }
  }
  if (!res.ok) throw new ApiError(res.status, url, await readErrorCode(res))
  return parseResponse<T>(res)
}

async function apiFetch<T>(path: string, params?: Params, token?: string): Promise<T> {
  return request<T>(buildUrl(path, params), { method: 'GET' }, token)
}

async function apiPost<T, B = unknown>(path: string, body: B, token?: string): Promise<T> {
  return request<T>(`/api/${path}`, { method: 'POST', body: JSON.stringify(body) }, token)
}

async function apiPut<T, B = unknown>(path: string, body: B, token?: string): Promise<T> {
  return request<T>(`/api/${path}`, { method: 'PUT', body: JSON.stringify(body) }, token)
}

async function apiDelete<T = void>(path: string, token?: string): Promise<T> {
  return request<T>(`/api/${path}`, { method: 'DELETE' }, token)
}

export { apiFetch, apiPost, apiPut, apiDelete, ApiError, LIMIT }
