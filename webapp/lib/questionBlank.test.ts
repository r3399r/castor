import { describe, expect, it } from 'vitest'
import {
  blankNumberFromContent,
  blankNumbersFromPassage,
  markBlanksInPassage,
} from './questionBlank'

/**
 * Both authoring forms of a 文意選填／篇章結構 passage are live and
 * nothing migrates the older one, so these cover the strictness that
 * keeps them apart: the CLOZE side reads only `data-blank`, because the
 * server counted the blanks with the same pattern, while the legacy GROUP
 * side is allowed to guess from a bare `<u>31</u>`.
 */
describe('blankNumberFromContent', () => {
  it('recognises a sub-question whose whole content is the blank number', () => {
    expect(blankNumberFromContent('31')).toBe(31)
    expect(blankNumberFromContent('<p>31</p>')).toBe(31)
    expect(blankNumberFromContent('<p><strong>7</strong></p>')).toBe(7)
  })

  it('accepts the hand-entered spellings', () => {
    expect(blankNumberFromContent('第 31 題')).toBe(31)
    expect(blankNumberFromContent('第31題')).toBe(31)
    expect(blankNumberFromContent('31 格')).toBe(31)
    expect(blankNumberFromContent('31.')).toBe(31)
    expect(blankNumberFromContent('31、')).toBe(31)
    expect(blankNumberFromContent('31：')).toBe(31)
  })

  it('reads the HTML entities an extracted passage carries', () => {
    expect(blankNumberFromContent('&nbsp;&nbsp;31&nbsp;')).toBe(31)
    expect(blankNumberFromContent('&#160;31&#xa0;')).toBe(31)
  })

  it('refuses a real question that merely starts with a digit', () => {
    // The whole point of anchoring the pattern: this is a question, and
    // rendering it as "blank 3" would hide what was being asked.
    expect(blankNumberFromContent('3 的倍數有幾個？')).toBeNull()
    expect(blankNumberFromContent('<p>31 與 32 的和是多少？</p>')).toBeNull()
  })

  it('refuses a run of digits too long to be a blank number', () => {
    // 1949 is a year or a quantity; no paper numbers its blanks past 999.
    expect(blankNumberFromContent('1949')).toBeNull()
    expect(blankNumberFromContent('999')).toBe(999)
  })

  it('refuses zero and nothing', () => {
    expect(blankNumberFromContent('0')).toBeNull()
    expect(blankNumberFromContent('')).toBeNull()
    expect(blankNumberFromContent(null)).toBeNull()
    expect(blankNumberFromContent(undefined)).toBeNull()
    expect(blankNumberFromContent('<p></p>')).toBeNull()
  })
})

describe('blankNumbersFromPassage', () => {
  it('lists the data-blank numbers in the order the passage has them', () => {
    const html =
      '<p>A <u data-blank="31">　</u> B <u data-blank="32">　</u> C <u data-blank="33">　</u></p>'
    expect(blankNumbersFromPassage(html)).toEqual([31, 32, 33])
  })

  it('reads the attribute however it is quoted', () => {
    expect(
      blankNumbersFromPassage(`<u data-blank='4'>x</u><u data-blank=5>y</u>`)
    ).toEqual([4, 5])
  })

  it('keeps numbers that neither start at 1 nor ascend', () => {
    // These are labels for positional rows, not a sequence: the count is
    // what has to match the answer length, not the order.
    expect(
      blankNumbersFromPassage('<u data-blank="40">a</u><u data-blank="39">b</u>')
    ).toEqual([40, 39])
  })

  it('ignores an underlined number that carries no data-blank', () => {
    // A CLOZE's rows are labelled from this, so picking up "in the 50s"
    // would shift every later row's label by one -- the user would be
    // answering blank 32 in a row labelled 50.
    expect(blankNumbersFromPassage('<p>in the <u>50</u>s</p>')).toEqual([])
  })

  it('has nothing to say about an empty passage', () => {
    expect(blankNumbersFromPassage('')).toEqual([])
    expect(blankNumbersFromPassage(null)).toEqual([])
    expect(blankNumbersFromPassage(undefined)).toEqual([])
    expect(blankNumbersFromPassage('<p>no blanks here</p>')).toEqual([])
  })
})

describe('markBlanksInPassage', () => {
  const passage =
    '<p>A <u data-blank="31">　31　</u> B <u data-blank="32">　32　</u></p>'

  it('wraps the wanted blank and reports it as marked', () => {
    const { html, marked } = markBlanksInPassage(passage, [31], 'hit')
    expect(html).toContain('<span class="hit" data-wrong-blank="31">')
    expect([...marked]).toEqual([31])
  })

  it('leaves the blanks nobody asked for untouched', () => {
    const { html } = markBlanksInPassage(passage, [31], 'hit')
    expect(html).toContain('<u data-blank="32">　32　</u>')
    expect(html.match(/<span class="hit"/g)).toHaveLength(1)
  })

  it('returns the passage unchanged when nothing is wanted', () => {
    const { html, marked } = markBlanksInPassage(passage, [], 'hit')
    expect(html).toBe(passage)
    expect(marked.size).toBe(0)
  })

  it('reports back which wanted blanks it could not find', () => {
    // Best-effort by design: a blank it cannot locate leaves the
    // sub-question rendering as it did before, so the caller needs to
    // know rather than assume the highlight landed.
    const { marked } = markBlanksInPassage(passage, [31, 99], 'hit')
    expect([...marked]).toEqual([31])
    expect(marked.has(99)).toBe(false)
  })

  it('still finds a legacy blank that is a bare underlined number', () => {
    // Questions extracted before the data-blank rule have no attribute.
    const legacy = '<p>A <u>&nbsp;31&nbsp;</u> B</p>'
    const { html, marked } = markBlanksInPassage(legacy, [31], 'hit')
    expect([...marked]).toEqual([31])
    expect(html).toContain('data-wrong-blank="31"')
  })

  it('leaves an underlined phrase that is not a number alone', () => {
    // Emphasis in the prose, not a blank -- the legacy matcher only gets
    // to guess when the element holds nothing but digits.
    const { html, marked } = markBlanksInPassage(
      '<p>the <u>most</u> important</p>',
      [31],
      'hit'
    )
    expect(marked.size).toBe(0)
    expect(html).toBe('<p>the <u>most</u> important</p>')
  })

  it('does not let 1 match inside 11', () => {
    const { marked } = markBlanksInPassage('<u data-blank="11">x</u>', [1], 'hit')
    expect(marked.size).toBe(0)
  })

  it('marks every occurrence of a blank that appears twice', () => {
    const twice = '<u data-blank="31">a</u><u data-blank="31">b</u>'
    const { html } = markBlanksInPassage(twice, [31], 'hit')
    expect(html.match(/<span class="hit"/g)).toHaveLength(2)
  })
})
