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
      if (!retry.ok) throw new Error(`API ${retry.status}: ${url}`)
      return parseResponse<T>(retry)
    }
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`)
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

export { apiFetch, apiPost, apiPut, apiDelete, LIMIT }
