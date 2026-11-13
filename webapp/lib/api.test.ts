import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { version } from '../package.json'

/**
 * The single client every screen goes through, so the things pinned here
 * are the ones a wrong answer would hide: which token goes on the
 * request, that a 401 is retried exactly once with a fresh one, and that
 * the backend's error `code` survives -- it is the only thing separating
 * an overloaded AI provider from a malformed AI reply, both of which
 * arrive as a bare 502.
 *
 * Firebase is mocked because importing it for real initialises the SDK,
 * and `fetch` is stubbed rather than served: what is under test is the
 * request this module builds, not a transport.
 */
const { authStub } = vi.hoisted(() => ({
  authStub: {
    currentUser: null as null | { getIdToken: (force: boolean) => Promise<string> },
  },
}))

vi.mock('@/lib/firebase', () => ({ auth: authStub }))

// A static import is safe despite the mock above: `vi.mock` is hoisted
// over the imports, so firebase is already stubbed when this is loaded.
import { ApiError, LIMIT, apiDelete, apiFetch, apiPost, apiPut } from './api'

type StubResponse = { status: number; ok: boolean; json: () => Promise<unknown> }

const ok = (body: unknown = { ok: true }): StubResponse => ({
  status: 200,
  ok: true,
  json: async () => body,
})

const fail = (status: number, body: unknown = {}): StubResponse => ({
  status,
  ok: false,
  json: async () => body,
})

const fetchMock = vi.fn()

const stubSessionStorage = (token?: string) => {
  const map = new Map<string, string>()
  if (token !== undefined) map.set('idToken', token)
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
    configurable: true,
    writable: true,
  })
  return map
}

const headersOf = (call: number) =>
  (fetchMock.mock.calls[call][1] as { headers: Record<string, string> }).headers

const initOf = (call: number) => fetchMock.mock.calls[call][1] as RequestInit

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  authStub.currentUser = null
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis as object, 'sessionStorage')
})

describe('the url it builds', () => {
  it('prefixes the path with /api/', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiFetch('info/growth')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/info/growth')
  })

  it('appends the params it was given', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiFetch('question', { subjectId: 3, keyword: 'a b' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question?subjectId=3&keyword=a%20b')
  })

  it('drops an undefined param instead of sending the string', async () => {
    // Every list screen passes optional filters straight through, and
    // `keyword=undefined` is a filter the backend would honour.
    fetchMock.mockResolvedValue(ok())
    await apiFetch('question', { subjectId: 3, keyword: undefined })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question?subjectId=3')
  })

  it('leaves the url bare when every param was dropped', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiFetch('question', { keyword: undefined })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question')
  })

  it('encodes a param name as well as its value', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiFetch('question', { 'a&b': 'c=d' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question?a%26b=c%3Dd')
  })
})

describe('the headers it sends', () => {
  it('sends the stored id token', async () => {
    stubSessionStorage('stored-token')
    fetchMock.mockResolvedValue(ok())
    await apiFetch('user/me')
    expect(headersOf(0).Authorization).toBe('stored-token')
  })

  it('sends NO_AUTH when nothing is stored, and when there is no storage at all', async () => {
    // A static export renders with no sessionStorage; the backend reads
    // NO_AUTH as "no caller", which is what the public routes expect.
    stubSessionStorage()
    fetchMock.mockResolvedValue(ok())
    await apiFetch('info/growth')
    expect(headersOf(0).Authorization).toBe('NO_AUTH')

    Reflect.deleteProperty(globalThis as object, 'sessionStorage')
    await apiFetch('info/growth')
    expect(headersOf(1).Authorization).toBe('NO_AUTH')
  })

  it('prefers a token handed in by the caller', async () => {
    stubSessionStorage('stored-token')
    fetchMock.mockResolvedValue(ok())
    await apiFetch('user/me', undefined, 'explicit-token')
    expect(headersOf(0).Authorization).toBe('explicit-token')
  })

  it('states the webapp version the backend is being called by', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiFetch('info/growth')
    expect(headersOf(0)['x-api-version']).toBe(version)
    expect(headersOf(0)['Content-Type']).toBe('application/json')
  })
})

describe('the body it reads back', () => {
  it('returns the parsed json', async () => {
    fetchMock.mockResolvedValue(ok({ subscriberXpBonusPercent: 10 }))
    await expect(apiFetch('info/growth')).resolves.toEqual({
      subscriberXpBonusPercent: 10,
    })
  })

  it('returns undefined for a 204, without trying to parse it', async () => {
    // DELETE routes answer 204, and `res.json()` on an empty body throws.
    const json = vi.fn()
    fetchMock.mockResolvedValue({ status: 204, ok: true, json })
    await expect(apiDelete('question/1')).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })
})

describe('the methods', () => {
  it('sends a POST with a json body', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiPost('reply', { questionId: 1, answer: 'A' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reply')
    expect(initOf(0).method).toBe('POST')
    expect(initOf(0).body).toBe('{"questionId":1,"answer":"A"}')
  })

  it('sends a PUT with a json body', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiPut('question/1', { content: 'x' })
    expect(initOf(0).method).toBe('PUT')
    expect(initOf(0).body).toBe('{"content":"x"}')
  })

  it('sends a DELETE with no body', async () => {
    fetchMock.mockResolvedValue(ok())
    await apiDelete('question/1')
    expect(initOf(0).method).toBe('DELETE')
    expect(initOf(0).body).toBeUndefined()
  })
})

describe('the error it throws', () => {
  it('carries the status, the url and the backend code', async () => {
    fetchMock.mockResolvedValue(fail(502, { code: 'AI_OVERLOADED' }))
    const error = await apiFetch('question/analyse').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 502,
      code: 'AI_OVERLOADED',
      name: 'ApiError',
      message: 'API 502: /api/question/analyse',
    })
  })

  it('still throws when the error body is not json', async () => {
    // CloudFront and API Gateway can answer with HTML before the Lambda
    // is reached; crashing while handling an error would be worse than
    // losing the code.
    fetchMock.mockResolvedValue({
      status: 503,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })
    const error = (await apiFetch('info/growth').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(503)
    expect(error.code).toBeUndefined()
  })

  it('ignores a code that is not a string', async () => {
    fetchMock.mockResolvedValue(fail(400, { code: 42 }))
    const error = (await apiFetch('question').catch((e: unknown) => e)) as ApiError
    expect(error.code).toBeUndefined()
  })
})

describe('the 401 retry', () => {
  it('refreshes the token once and replays the request', async () => {
    const storage = stubSessionStorage('stale-token')
    authStub.currentUser = { getIdToken: vi.fn(async () => 'fresh-token') }
    fetchMock.mockResolvedValueOnce(fail(401)).mockResolvedValueOnce(ok({ id: 1 }))

    await expect(apiFetch('user/me')).resolves.toEqual({ id: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(headersOf(1).Authorization).toBe('fresh-token')
    // Stored, so the next request does not need the round trip.
    expect(storage.get('idToken')).toBe('fresh-token')
    expect(authStub.currentUser.getIdToken).toHaveBeenCalledWith(true)
  })

  it('throws the retry status when the replay fails too', async () => {
    stubSessionStorage('stale-token')
    authStub.currentUser = { getIdToken: async () => 'fresh-token' }
    fetchMock.mockResolvedValueOnce(fail(401)).mockResolvedValueOnce(fail(403, { code: 'FORBIDDEN' }))

    const error = (await apiFetch('user/me').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(403)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('does not retry when nobody is signed in', async () => {
    stubSessionStorage('stale-token')
    fetchMock.mockResolvedValue(fail(401))
    const error = (await apiFetch('user/me').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a request whose token the caller chose', async () => {
    // The caller holds a token for a reason -- server-side rendering, or
    // a freshly signed-in user -- and refreshing it here would replace it
    // with whoever the SDK currently has.
    authStub.currentUser = { getIdToken: vi.fn(async () => 'fresh-token') }
    fetchMock.mockResolvedValue(fail(401))

    const error = (await apiFetch('user/me', undefined, 'explicit').catch(
      (e: unknown) => e
    )) as ApiError
    expect(error.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(authStub.currentUser.getIdToken).not.toHaveBeenCalled()
  })
})

describe('LIMIT', () => {
  it('is the page size the list screens share', () => {
    expect(LIMIT).toBe(20)
  })
})
