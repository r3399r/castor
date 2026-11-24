import { afterEach, describe, expect, it } from 'vitest';
import { isBetaMode } from 'src/lib/beta';

/**
 * The flag's failure direction is what matters here, not the happy path:
 * a misspelled or missing value must leave the paywall standing. The
 * alternative -- truthy-string parsing -- would open every paid feature
 * for `BETA_MODE=false`.
 */
describe('isBetaMode', () => {
  const original = process.env.BETA_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.BETA_MODE;
    else process.env.BETA_MODE = original;
  });

  it('is on for exactly "true"', () => {
    process.env.BETA_MODE = 'true';
    expect(isBetaMode()).toBe(true);
  });

  it('is off when unset', () => {
    delete process.env.BETA_MODE;
    expect(isBetaMode()).toBe(false);
  });

  it.each(['false', 'False', 'TRUE', '1', 'yes', ''])('is off for %o', (value) => {
    process.env.BETA_MODE = value;
    expect(isBetaMode()).toBe(false);
  });
});
