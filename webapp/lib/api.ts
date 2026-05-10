import { auth } from '@/lib/firebase'

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

async function apiFetch<T>(path: string, params?: Params, token?: string): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token ?? getStoredToken(),
    },
  })
  if (res.status === 401 && !token) {
    const newToken = await forceRefreshToken()
    if (newToken) {
      const retry = await fetch(buildUrl(path, params), {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: newToken,
        },
      })
      if (!retry.ok) throw new Error(`API ${retry.status}: ${path}`)
      return retry.json() as Promise<T>
    }
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function apiPost<T, B = unknown>(path: string, body: B, token?: string): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token ?? getStoredToken(),
    },
    body: JSON.stringify(body),
  })
  if (res.status === 401 && !token) {
    const newToken = await forceRefreshToken()
    if (newToken) {
      const retry = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: newToken,
        },
        body: JSON.stringify(body),
      })
      if (!retry.ok) throw new Error(`API ${retry.status}: ${path}`)
      return retry.json() as Promise<T>
    }
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export { apiFetch, apiPost, LIMIT }
