/**
 * Hand-off for an AI-recognised question draft between the question
 * management page (where it can now be uploaded) and the creation page
 * (which owns the review, exam/tag pickers and the batch submit).
 *
 * sessionStorage rather than a query param because a recognised question
 * carries its full HTML content and would blow past practical URL length
 * limits; and rather than a shared React context because the two pages are
 * separate documents in a static export, so nothing survives the
 * navigation in memory.
 */
const DRAFT_KEY = 'castor.questionDraft'

export type QuestionDraftHandoff = {
  subjectId: number
  /** Pretty-printed JSON array, exactly as the textarea expects it. */
  json: string
}

export function saveQuestionDraft(draft: QuestionDraftHandoff): boolean {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    // Private mode, blocked storage, or over quota. The caller falls back
    // to sending the admin to the creation page empty-handed rather than
    // losing the navigation entirely.
    return false
  }
}

/**
 * Reads and clears the draft in one go -- it is consumed exactly once, so
 * a refresh of the creation page doesn't silently overwrite edits the
 * admin has made to the draft since it landed.
 *
 * Returns null unless the draft was recognised for `expectedSubjectId`:
 * without that check, opening the creation page for a different subject
 * would pick up a stale draft whose conceptIds belong to another subject.
 */
export function takeQuestionDraft(expectedSubjectId: number): string | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (raw === null) return null
    sessionStorage.removeItem(DRAFT_KEY)
    const draft = JSON.parse(raw) as QuestionDraftHandoff
    if (draft.subjectId !== expectedSubjectId) return null
    return typeof draft.json === 'string' ? draft.json : null
  } catch {
    return null
  }
}
