const LIMIT = 20

type Params = Record<string, string | number | undefined>

function getStoredToken(): string {
  if (typeof sessionStorage === 'undefined') return 'NO_AUTH'
  return sessionStorage.getItem('idToken') ?? 'NO_AUTH'
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
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export { apiFetch, apiPost, LIMIT }
