import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUESTION_EXTRACT_INSTRUCTION } from 'src/lib/questionPrompt';

/**
 * QUESTION.md and `QUESTION_EXTRACT_INSTRUCTION` are the same document
 * twice: the admins read and iterate on the Markdown file, and the
 * constant is what the API lambda actually sends, because the bundle ships
 * without repo files beside it.
 *
 * The two were kept in step by a comment saying "edit both together",
 * which is not a mechanism. 2026-11-22 proved it: per-sub-question
 * `conceptIds` was documented in QUESTION.md and never added to the
 * constant, so the file the admins were reading described a field the
 * model had never been told about -- and nothing failed, because a prompt
 * cannot be wrong, only unhelpful. The extraction simply never produced
 * the field, which looks exactly like the model declining to use it.
 *
 * This is the mechanism. It compares the whole text, not a handful of
 * marker strings: a spot check only catches drift someone predicted.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Decodes the template literal's escapes, which are the one difference
 * between the two that is not drift.
 *
 * A literal backslash is written `\\` in the source and a literal backtick
 * `` \` ``, so the constant's runtime value already has them decoded --
 * except that the .md is read raw. Scanning for a backslash and taking the
 * next character verbatim handles both, and in the right order: two
 * separate `.replace` calls would turn a backslash followed by a backtick
 * into the wrong thing.
 */
const decodeEscapes = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      out += text[i + 1];
      i++;
    } else {
      out += text[i];
    }
  }
  return out;
};

describe('QUESTION_EXTRACT_INSTRUCTION', () => {
  it('is QUESTION.md verbatim', () => {
    const markdown = readFileSync(join(REPO_ROOT, 'QUESTION.md'), 'utf8').replace(/\r\n/g, '\n');

    // The constant's value is the already-decoded template literal, so
    // only the .md side needs decoding -- a `\\frac` in the source reaches
    // the model as `\frac`, and QUESTION.md writes `\frac`. Both sides go
    // through it so the comparison stays symmetric if one ever gains an
    // escape the other lacks.
    expect(decodeEscapes(QUESTION_EXTRACT_INSTRUCTION.trim())).toBe(
      decodeEscapes(markdown.trim())
    );
  });

  // Not a substitute for the comparison above -- it is there so a failure
  // of this file points at the right thing when someone has only edited
  // one side and cannot tell which.
  it('documents the fields POST /question actually accepts on a sub-question', () => {
    expect(QUESTION_EXTRACT_INSTRUCTION).toContain('題組的 conceptIds');
    expect(QUESTION_EXTRACT_INSTRUCTION).toContain('子題的 conceptIds 是選填');
  });
});
