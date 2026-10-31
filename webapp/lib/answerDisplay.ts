import type { Question } from '@/types/api'

/**
 * Turns a stored answer into something a user can read.
 *
 * The `answer` column is written for scoring, not for reading: MULTIPLE is
 * an O/X mask over the options ("OXOOO"), FILL is one character per blank
 * ("901"), TRUE_FALSE is the literal "True"/"False". Printing those raw --
 * which is what the 答題紀錄 and the result box after submitting did --
 * shows the user the database format instead of their own answer.
 *
 * Returns null when the stored value is already what the user picked, so a
 * caller can keep rendering it the way it always did. That matters for
 * SINGLE, where the answer is the option label itself and some older rows
 * hold markup that is still rendered as HTML.
 */
export const readableAnswer = (
  type: Question['type'] | undefined,
  answer: string | null | undefined,
  options: string | null | undefined
): string | null => {
  if (answer === null || answer === undefined || answer === '') return null

  if (type === 'TRUE_FALSE') {
    if (answer === 'True') return '是'
    if (answer === 'False') return '非'
    return null
  }

  const labels = options?.split('|') ?? []

  if (type === 'MULTIPLE') {
    // The mask is positional, so position i is option i. Falling back to
    // the position number keeps this readable for a row whose options are
    // missing, rather than printing the mask.
    const picked = [...answer]
      .map((flag, i) => (flag === 'O' ? labels[i] ?? `第 ${i + 1} 項` : null))
      .filter((label): label is string => label !== null)
    return picked.length > 0 ? picked.join('、') : '未選任何選項'
  }

  if (type === 'FILL') {
    // One character per blank, in blank order. A character that is not on
    // the keypad means that blank was left alone -- the answer input fills
    // untouched blanks with a placeholder rather than shortening the
    // string, because its length is what decides how many blanks there are.
    return [...answer]
      .map((char) => (labels.length === 0 || labels.includes(char) ? char : '－'))
      .join('、')
  }

  return null
}
