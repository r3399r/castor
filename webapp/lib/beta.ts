/**
 * Beta mode: the paid features are open to everyone, and nothing is for
 * sale yet.
 *
 * Set by `NEXT_PUBLIC_BETA_MODE` in `webapp/.env`, which the deploy
 * workflows generate (.github/workflows/dev.yml and prod.yml). `next
 * build` inlines it, and the webapp is a static export -- so this is a
 * **build-time** value, and flipping it needs a webapp deploy, not just
 * an environment change.
 *
 * Anything that is not exactly the string `'true'` is off, so a missing
 * or misspelled variable leaves the paywall standing rather than opening
 * it. That is the safe direction for a flag whose failure mode is giving
 * things away.
 *
 * A function rather than a module constant so a test can set
 * `process.env` without resetting the module registry; webpack replaces
 * the member expression either way.
 *
 * **This flag has a backend twin**, `BETA_MODE` in the API Lambda
 * (`backend_new/src/lib/beta.ts`), and the two are set in different
 * places -- here in the workflow's `.env`, there in CloudFormation. They
 * are meant to move together; AGENTS.md records what each disagreement
 * looks like. In short: this one alone unlocks UI whose requests then
 * answer 403 SUBSCRIPTION_REQUIRED, and `/analysis` is where that shows,
 * because its locked state is drawn from the 403 rather than from this
 * flag.
 */
export function isBetaMode(): boolean {
  return process.env.NEXT_PUBLIC_BETA_MODE === 'true'
}

/**
 * Entitlement as a gated block should read it.
 *
 * Three values, not two, and the third is the one that matters:
 *
 *   true  -- show the paid version
 *   false -- show the locked version
 *   null  -- not known yet; show neither
 *
 * `null` exists because AuthContext's `subscription` is null until
 * POST /user/sync answers, and "not known yet" is not "not subscribed":
 * a block that collapses the two flashes its locked state at a
 * subscriber on every page load. Under beta mode there is nothing to
 * wait for, so this answers true immediately.
 *
 * Every frontend read of `subscription.entitled` goes through here. A
 * screen that tests the field itself would keep its paywall through
 * beta, which is exactly the bug this function exists to prevent --
 * `/analysis` is the one deliberate exception, and it is deliberate
 * because the analysis endpoint's own 403 is a better source of truth
 * than this flag.
 */
export function resolveEntitlement(
  subscription: { entitled: boolean } | null,
): boolean | null {
  if (isBetaMode()) return true
  if (subscription === null) return null
  return subscription.entitled
}
