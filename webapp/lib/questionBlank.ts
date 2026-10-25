/**
 * 文意選填／篇章結構 sub-questions carry no question text of their own.
 *
 * By the authoring rules (QUESTION.md, 題組格式) the passage and the shared
 * option list live on the GROUP, each numbered blank becomes one child, and
 * the child's content is just the blank's number. Rendered as-is, such a
 * child shows a bare "31" and nothing else -- the reader has to go back up
 * and hunt for the 31st blank to find out what the question even was.
 *
 * These two helpers let a card mark the blank in the passage instead: one
 * recognises a number-only child, the other wraps the matching blank in the
 * passage HTML.
 *
 * The passage side is best-effort by design. The prompt now requires every
 * numbered blank to carry data-blank, but the model can still disobey it and
 * nothing re-extracts the questions that predate the rule, so a blank that
 * cannot be located leaves the sub-question rendering as it did before.
 */

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '');

const decodeSpaces = (text: string): string => text.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ');

// Deliberately strict: the whole content has to be the number, so a real
// question that merely starts with a digit ("3 的倍數有幾個？") is not
// mistaken for a blank marker. 第N題／N格 and a trailing separator are
// allowed because hand-entered questions use them. Capped at three digits
// -- no paper numbers its blanks past 999, and a longer run of digits is
// far more likely to be a year or a quantity that is the answer itself.
const NUMBER_ONLY = /^第?\s*(\d{1,3})\s*(?:題|格)?\s*[.、．:：]?$/;

/**
 * The blank number a sub-question stands for, or null when its content is
 * a real question and should be rendered normally.
 */
export const blankNumberFromContent = (html: string | null | undefined): number | null => {
  if (!html) return null;
  const text = decodeSpaces(stripTags(html)).replace(/\s+/g, ' ').trim();
  const match = NUMBER_ONLY.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
};

// A blank is authored as <u data-blank="31">&nbsp;&nbsp;31&nbsp;&nbsp;</u>
// (QUESTION.md, 題組格式) -- data-blank is what makes it machine-findable,
// and it says "this is blank 31" rather than leaving us to guess from an
// underlined number.
//
// Questions extracted before that rule existed have no attribute, so a <u>
// holding nothing but the number counts too. Anchoring on the whole element
// content keeps 1 from matching inside 11, and an underlined number in the
// middle of a sentence is not mistaken for a blank.
//
// Spellings outside <u> -- （31）, __31__, 31. -- are deliberately not
// matched: a number in brackets appears in ordinary prose, and a highlight
// on the wrong word is worse than no highlight. Anything unmatched is
// reported back so the caller can fall back to showing the number.
const U_ELEMENT = /<u\b([^>]*)>([\s\S]*?)<\/u>/gi;
const DATA_BLANK = /\bdata-blank\s*=\s*["']?(\d{1,3})["']?/i;
const DIGITS_ONLY = /^(?:&nbsp;|&#160;|&#xa0;|\s)*(\d{1,3})(?:&nbsp;|&#160;|&#xa0;|\s)*$/i;

const blankNumberOfElement = (attrs: string, inner: string): number | null => {
  const attr = DATA_BLANK.exec(attrs);
  if (attr) return Number(attr[1]);
  const digits = DIGITS_ONLY.exec(inner);
  return digits ? Number(digits[1]) : null;
};

/**
 * Wraps each wanted blank in `className`, and reports which ones were found.
 *
 * `className` is interpolated into HTML, so it must be a class name the
 * caller controls (a CSS-module class), never anything user-supplied.
 */
export const markBlanksInPassage = (
  html: string,
  wanted: Iterable<number>,
  className: string
): { html: string; marked: Set<number> } => {
  const want = new Set(wanted);
  const marked = new Set<number>();
  if (want.size === 0) return { html, marked };

  const out = html.replace(U_ELEMENT, (match, attrs: string, inner: string) => {
    const n = blankNumberOfElement(attrs, inner);
    if (n === null || !want.has(n)) return match;
    marked.add(n);
    return `<span class="${className}" data-wrong-blank="${n}">${match}</span>`;
  });

  return { html: out, marked };
};
