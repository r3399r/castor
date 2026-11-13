import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveQuestionDraft, takeQuestionDraft } from './questionDraft'

/**
 * A plain in-memory Storage rather than jsdom: what is under test is the
 * hand-off contract (consumed once, and only by the subject it was
 * recognised for), not the browser's implementation of sessionStorage.
 * `throwOn` covers private mode, blocked storage and quota -- the reason
 * `saveQuestionDraft` reports a boolean at all.
 */
const stubStorage = (throwOn?: 'setItem' | 'getItem') => {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => {
      if (throwOn === 'getItem') throw new Error('blocked')
      return map.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (throwOn === 'setItem') throw new Error('quota')
      map.set(key, value)
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return map
}

let stored: Map<string, string>

beforeEach(() => {
  stored = stubStorage()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'sessionStorage')
})

describe('saveQuestionDraft', () => {
  it('stores the draft and says so', () => {
    expect(saveQuestionDraft({ subjectId: 3, json: '[{"content":"x"}]' })).toBe(true)
    expect(stored.size).toBe(1)
  })

  it('reports failure instead of throwing when storage refuses', () => {
    // The caller then sends the admin to the creation page empty-handed
    // rather than losing the navigation entirely.
    stubStorage('setItem')
    expect(saveQuestionDraft({ subjectId: 3, json: '[]' })).toBe(false)
  })
})

describe('takeQuestionDraft', () => {
  it('returns the json for the subject it was recognised for', () => {
    saveQuestionDraft({ subjectId: 3, json: '[{"content":"x"}]' })
    expect(takeQuestionDraft(3)).toBe('[{"content":"x"}]')
  })

  it('consumes the draft, so a refresh does not re-apply it', () => {
    // Otherwise reloading the creation page would silently overwrite the
    // edits the admin has made since the draft landed.
    saveQuestionDraft({ subjectId: 3, json: '[]' })
    expect(takeQuestionDraft(3)).toBe('[]')
    expect(takeQuestionDraft(3)).toBeNull()
    expect(stored.size).toBe(0)
  })

  it('refuses a draft recognised for another subject', () => {
    // Its conceptIds belong to that subject, so applying it here would
    // tag the question with concepts from the wrong one. The draft is
    // cleared as well -- the read is a take, whoever asked.
    saveQuestionDraft({ subjectId: 5, json: '[]' })
    expect(takeQuestionDraft(3)).toBeNull()
    expect(stored.size).toBe(0)
  })

  it('returns null when there is nothing waiting', () => {
    expect(takeQuestionDraft(3)).toBeNull()
  })

  it('returns null for a stored value it cannot read', () => {
    // Left by an older release, or by something else writing the key.
    stored.set('castor.questionDraft', 'not json')
    expect(takeQuestionDraft(3)).toBeNull()

    stored.set('castor.questionDraft', JSON.stringify({ subjectId: 3, json: 42 }))
    expect(takeQuestionDraft(3)).toBeNull()
  })

  it('returns null rather than throwing when storage is blocked', () => {
    stubStorage('getItem')
    expect(takeQuestionDraft(3)).toBeNull()
  })
})
