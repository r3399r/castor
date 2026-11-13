import { describe, expect, it } from 'vitest'
import { readableAnswer } from './answerDisplay'

/**
 * The `answer` column is written for scoring, so every case here is a
 * storage format that used to be printed at the user verbatim: an "OXOOO"
 * mask in the 答題紀錄, a "901" string in the result box. `null` means
 * "the stored value already reads as the user's answer", which the caller
 * renders the way it always did -- it is not an error state.
 */
describe('readableAnswer', () => {
  it('says nothing for an answer that was never given', () => {
    expect(readableAnswer('SINGLE', null, 'A|B')).toBeNull()
    expect(readableAnswer('SINGLE', undefined, 'A|B')).toBeNull()
    expect(readableAnswer('SINGLE', '', 'A|B')).toBeNull()
  })

  it('leaves SINGLE alone, because the stored value is the chosen label', () => {
    // Some older rows hold markup here that the caller still renders as
    // HTML, so this must not be turned into text.
    expect(readableAnswer('SINGLE', '<em>A</em>', 'A|B')).toBeNull()
  })

  it('reads TRUE_FALSE as 是 / 非', () => {
    expect(readableAnswer('TRUE_FALSE', 'True', null)).toBe('是')
    expect(readableAnswer('TRUE_FALSE', 'False', null)).toBe('非')
  })

  it('declines to guess at a TRUE_FALSE value it does not recognise', () => {
    // '1' or 'true' would be a row written by something other than this
    // app; printing 是 for it would be inventing the user's answer.
    expect(readableAnswer('TRUE_FALSE', 'true', null)).toBeNull()
    expect(readableAnswer('TRUE_FALSE', '1', null)).toBeNull()
  })

  describe('MULTIPLE', () => {
    it('names the options the O positions point at', () => {
      expect(readableAnswer('MULTIPLE', 'OXOOO', 'A|B|C|D|E')).toBe('A、C、D、E')
      expect(readableAnswer('MULTIPLE', 'XOXOX', 'A|B|C|D|E')).toBe('B、D')
    })

    it('falls back to the position number when the options are missing', () => {
      expect(readableAnswer('MULTIPLE', 'OXO', null)).toBe('第 1 項、第 3 項')
    })

    it('falls back for position 0 of an empty options column too', () => {
      // `''.split('|')` is `['']`, not `[]`, so the first position has a
      // label -- an empty one. With `??` guarding the fallback this
      // rendered as '、第 3 項', a list starting with nothing.
      expect(readableAnswer('MULTIPLE', 'OXO', '')).toBe('第 1 項、第 3 項')
    })

    it('falls back per position when the mask is longer than the options', () => {
      // A row whose option list was edited after the answer was stored.
      expect(readableAnswer('MULTIPLE', 'OOO', 'A|B')).toBe('A、B、第 3 項')
    })

    it('says so explicitly when nothing was selected', () => {
      // Rather than the empty string, which reads as a rendering bug.
      expect(readableAnswer('MULTIPLE', 'XXXXX', 'A|B|C|D|E')).toBe('未選任何選項')
    })
  })

  describe('FILL and CLOZE', () => {
    it('lists one character per blank, in blank order', () => {
      expect(readableAnswer('FILL', '901', '0|1|2|3|4|5|6|7|8|9')).toBe('9、0、1')
      expect(readableAnswer('CLOZE', 'CGA', 'A|B|C|D|E|F|G')).toBe('C、G、A')
    })

    it('marks a blank left alone rather than printing the placeholder', () => {
      // The input pads untouched blanks instead of shortening the string,
      // because the string's length is what says how many blanks there are.
      expect(readableAnswer('CLOZE', 'C_A', 'A|B|C')).toBe('C、－、A')
      expect(readableAnswer('CLOZE', '???', 'A|B|C')).toBe('－、－、－')
    })

    it('shows the characters as they are when there are no options to check', () => {
      // FILL answers are not always drawn from an option list.
      expect(readableAnswer('FILL', '42', null)).toBe('4、2')
    })
  })

  it('says nothing for a type it has no format for', () => {
    expect(readableAnswer('GROUP', 'anything', 'A|B')).toBeNull()
    expect(readableAnswer(undefined, 'anything', 'A|B')).toBeNull()
  })
})
