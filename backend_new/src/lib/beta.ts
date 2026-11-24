/**
 * Beta mode: every paid feature is open to every signed-in user.
 *
 * Set by `BETA_MODE` in the API Lambda's environment (see
 * aws/cloudformation/template.yaml). Anything that is not exactly the
 * string `'true'` is off, matching how src/lib/ecpay.ts reads
 * ECPAY_MODE -- an unset or misspelled variable leaves the paywall
 * standing rather than opening it, which is the safe direction for a
 * flag whose failure mode is giving things away.
 *
 * Read through this function rather than a module constant: the value
 * is read per call, so a test can set it with process.env and does not
 * have to reset the module registry.
 *
 * **This flag has a frontend twin**, `NEXT_PUBLIC_BETA_MODE` in
 * `webapp/`, and the two are set independently -- one in CloudFormation,
 * one in the deploy workflow's generated `.env`. They are meant to move
 * together, and AGENTS.md records what each disagreement looks like. The
 * short version: this one alone means the UI still shows locked states
 * for features the server would now allow; the frontend one alone means
 * unlocked UI whose requests answer 403 SUBSCRIPTION_REQUIRED.
 *
 * What this deliberately does **not** touch:
 *
 *   - `GET /subscription/me`, `/history` and `POST /user/sync` keep
 *     reporting what the database actually holds. They answer "what has
 *     this user bought", which beta does not change; faking `entitled`
 *     there would make the admin user table and the /user subscription
 *     card describe a subscription that does not exist, and would
 *     survive beta as wrong history.
 *   - `POST /payment/checkout`. Beta closes the subscription page, so
 *     nothing reaches it; the gate on charging a card stays ECPAY_MODE.
 */
export const isBetaMode = (): boolean => process.env.BETA_MODE === 'true';
