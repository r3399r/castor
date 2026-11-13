# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.

## Project structure

npm workspaces monorepo (`webapp`, `backend_new`, `packages/*`):

- `backend_new/` — **active** backend (Hono + Drizzle ORM + MySQL, deployed as AWS Lambdas). Do new backend work here.
- `webapp/` — Next.js 15 (App Router) admin/user web frontend.
- `mobile/` — Flutter app.
- `db/` — raw SQL table definitions (`db/table/*.sql`), also used to seed the local Docker MySQL for `backend_new` tests.
- `packages/shared` (`@castor/shared`) — imported by `backend_new` only; the webapp dropped the dependency on 2026-11-13. What is left is the hand-written response types nothing checks and the growth-bonus arithmetic, and both have replacements, so this package is waiting to be deleted rather than being added to.
- `deploy.sh` — deploys `backend_new` (CloudFormation) and syncs the webapp SSG output to S3, from CI. Sections get commented out from time to time to deploy only one side — read it before assuming what a deploy does.

## Documents at the repo root

Read the relevant one **before** starting, not after. Each exists because the
thing it describes has at least one failure mode that produces no error.

| File | Answers | Read it when |
| --- | --- | --- |
| `AGENTS.md` | this file — rules, conventions, and the known-gaps table at the bottom | always, first |
| `GUARDIAN.md` | how to add a spirit egg (category-bound or VIP), and how to add a public-interest category | adding, removing or renaming an egg or a category |
| `DONATION.md` | the LV5 donation feature: decisions, data model, every endpoint and page, what is still missing | anything touching donations, payouts or the public transparency page |
| `POINTS.md` | the scoring formula, what a point is worth, and how the per-spirit total, the subscription price and the donation amount are locked together | changing scoring, XP thresholds, egg price, question sampling, or any of those three prices |
| `QUESTION.md` | the Gemini prompt for transcribing a question screenshot | editing that prompt (and `src/lib/questionPrompt.ts` in the same change) |
| `README.md` | local Docker setup only | setting up a machine |

## Rules

### General

- Read existing code before modifying it.
- Do not modify unrelated files.
- Do not introduce dependencies without explaining why.
- Keep changes focused on the assigned task.
- This is a workspaces monorepo: install dependencies from the repo root, not inside a workspace.
- Do not commit secrets. `.env.local` / `webapp/.env.*` are local-only; `webapp/.env.example` is the template to update when a new variable is added.
- When a change makes part of this file untrue, correct or delete that part **in the same change** — a stale rule is worse than no rule, because it gets followed. If a statement here contradicts the code, check `git log -S` before assuming which one is wrong: a deliberate removal means this file is stale, an accidental one means the code regressed, and the two need opposite fixes.
- Keep this file to what the code cannot tell you: decisions and their rationale, couplings that fail silently, and actions needed outside the repo. Anything a single `grep` or `ls` would answer — file paths, exact pixel values, command lists — belongs in the code, which stays in sync on its own.

### Database

- Schema changes must be made in `db/table/*.sql`, and the matching Drizzle definitions in `backend_new/src/db/schema.ts` must be updated in the same change — the two are hand-kept in sync and regression tests seed from `db/table/`.
- Do not modify production database structure directly.
- Data backfills/seeds belong in `db/script/<version>/`, not in application code. `docker-compose.yml` mounts them after the table DDL (`9x_` prefixes) so a fresh local DB is not empty.
- A seed containing non-ASCII text must start with `SET NAMES utf8mb4;`. The client that `docker-entrypoint-initdb.d` runs it with takes its charset from the container environment, which is latin1, so every Chinese character is silently double-encoded — 暖陽之蛋 lands as 12 characters, 29 bytes, nothing errors, and the rows read as mojibake forever after. `char_length()` is how you tell that apart from a terminal that simply cannot print CJK.
- There is no migration tool. A new table in `db/table/*.sql` reaches a real environment only when someone runs the DDL by hand, and reaches the local test DB only on a fresh volume (`docker-entrypoint-initdb.d` does not re-run) — so also add the file to `backend_new/docker-compose.yml` and tell the user to run it against prod. Say so explicitly when a deploy would otherwise ship code that queries a table that is not there yet.

### Backend

- All backend work happens in `backend_new/`. The legacy TypeORM/Inversify backend was deleted on 2026-11-12 after confirming that every path the webapp calls is served by `backend_new` and that nothing in CI or `deploy.sh` built it; `git log -- backend/` still has it.
- API contracts must stay backward compatible unless the task explicitly requires a breaking change; `webapp/` and `mobile/` both consume them.
- Validate request input with zod in the route file, and throw `HttpError` subclasses from `src/model/error/` rather than returning ad-hoc error responses.
- Do not bypass the middleware chain in `src/app.ts` (`adminAuth` / `requireAdmin` / `transaction` / `requireUser` / `requireSubscription`). New routes go behind the same chain as comparable existing routes.
- Do not open your own DB connection — use the `db` from the request context (`c.get('db')`) so work stays inside the request transaction.
- Adding a new Lambda entrypoint means updating `package.json` build scripts *and* `aws/cloudformation/template.yaml`.
- `POST /question/image` transcribes a screenshot of one question via Gemini (up to 3 crops of the same question per request). Its prompt is `QUESTION.md` at the repo root, mirrored verbatim into `backend_new/src/lib/questionPrompt.ts` because the bundled Lambda has no repo files at runtime — edit both together. Running it locally needs `GOOGLE_GENAI_API_KEY` in `backend_new/.env.local`; the regression suite mocks `src/lib/genai` so it does not.
- Run `npm run typecheck` and `npm run test:unit` before declaring backend work done; run `npm test` when touching routes or DB access.

#### Subscription and paid features

`user_subscription` holds **one row per subscription period, not per user**. Renewing or re-subscribing inserts a new row, so the table is also the subscription history; a `UNIQUE(user_id)` would make renewals overwrite the previous period and destroy exactly what it exists to keep. Nothing was added to `user` — the foreign key lives on the subscription side, like `user_concept_stat`, `user_stat_history` and `point_transaction`.

- The `/box` subscriber `+10%` cultivation XP is currently a frontend-only preview. `POST /guardian/:id/invest` still receives the raw point amount and the backend still grants the existing 1:1 XP; do not describe the preview as credited XP until backend entitlement and rounding rules are implemented.

- **Access is `status = 'active'` AND `current_period_end > NOW()`**, never status alone. A lapsed period therefore stops granting access by itself, with no sweeper job to run and nothing to break if one is ever missed. Do not "simplify" this to a status check and add a cron to compensate — that trades a design that cannot fail for one that can.
- A consequence: a naturally-lapsed row keeps saying `status = 'active'` forever. That is harmless for access and for `/subscription/me`, but `GET /subscription/history` returns the raw column, so a past period can display as active. Derive the display status at read time if that matters; do not add a sweeper for it.
- `at most one active row per user` is enforced by the database, not by application code: `active_user_id` is a generated column (`IF(status='active', user_id, NULL)`) with a UNIQUE index, since MySQL has no partial indexes and UNIQUE ignores NULLs. It exists because a retried payment webhook is the realistic way two live subscriptions get created. `setSubscription` must therefore close a lapsed-but-still-`active` row before inserting a new one.
- `requireSubscription` (`src/middleware/requireSubscription.ts`) runs after `requireUser` and throws 403 with code `SUBSCRIPTION_REQUIRED` — distinct so the frontend can show an upgrade prompt rather than a generic failure. 401 would be wrong: the caller is authenticated, just not entitled.
- `GET /subscription/me` and `/history` sit behind `requireUser` only and must stay that way. They are what a non-subscriber calls; gating them would mean the only way to discover you are not subscribed is to be refused.
- Two functions write periods and they are not interchangeable. `setSubscription` answers "make sure this user has access" and is a no-op when they already do — it is what the admin grant and the cancel path use. `renewSubscriptionPeriod` always appends a period, because it is called once per successful charge and the user paid for every one of them; it owes its idempotency entirely to the caller (`payment_charge.gwsr`). Using `setSubscription` from a webhook would silently drop renewals, and `renewSubscriptionPeriod` from the admin route would hand out a period per click.
- `PUT /user/:id/subscription` (admin only, idempotent both ways) predates the payment integration and **is still live by explicit decision** (2026-11-01), so an admin can grant paid access indefinitely. It must never become callable by a user on their own account. Entitlement for real customers comes from the ECPay webhook; this route exists alongside it for comps and support fixes.
- Subscription status is folded into `POST /user/sync` and the admin `GET /user` listing so sign-in and the admin table cost no extra request. The listing uses one batched query for the page, not one per row. Sync runs once per sign-in, so `AuthContext.refreshSubscription()` exists for the one moment that is not enough: immediately after a payment, when every gated block would otherwise still show its locked state.

#### Payments (ECPay 信用卡定期定額)

Two products, not one. **Recurring** billing runs through ECPay's *credit-card periodic* product: the cardholder authorises once and ECPay charges on its own schedule, notifying `PeriodReturnURL` each time. `payment_order` is one row per agreement and `payment_charge` one row per authorisation. **Day passes** (`days30`/`days90`/`days365`, added 2026-11-10) are single AIO payments buying a fixed number of days, in their own table `payment_purchase`, and they accept ATM and convenience-store payment — which is the point, since ECPay's recurring product is credit-card only and a student without a card could not buy anything. `backend_new/src/lib/ecpay.ts` owns the wire format for both.

Nothing on the day-pass paths fails loudly. Each of these is silent when it is wrong:

- **The payment method is chosen before the order exists**, and sent as a fixed `ChoosePayment`, never `ALL`. The expiry parameter differs per method and `StoreExpireDate` means **minutes** for a store code but **days** for a barcode, so one order cannot carry a correct expiry for a method nobody has picked. ECPay also warns that they add and change methods over time, so a fixed value is what keeps result notifications predictable.
- **`PaymentInfoURL` is a second callback, and not a payment.** ECPay posts the issued code or virtual account there (`RtnCode` 2 for ATM, 10100073 for CVS/BARCODE — both *success*), and only notifies `ReturnURL` when the money actually arrives, possibly a week later. Without that endpoint the payer never learns what to pay.
- **The ECPay callback origin is not `PUBLIC_BASE_URL`.** ECPay's notes require a server-to-server callback to address the origin, not a CDN; the public domain is CloudFront. Getting this wrong loses a notification that arrives after cash has changed hands. It is read off the invocation event (`src/middleware/apiOrigin.ts`) because the CloudFormation template cannot name the API without a circular dependency -- see the Deploy rules. `ECPAY_CALLBACK_BASE_URL` still overrides it and nothing sets it; falling through to the public origin logs an error rather than failing the checkout.
- **Neither `OrderResultURL` nor `ClientRedirectURL` is used.** The webapp is a static export and cannot answer a POST; `ClientBackURL` (a plain GET) is the only browser parameter sent, and the result page asks our own API what happened.
- **Having access and being charged again are different facts.** `GET /subscription/me` answers the first with `active` and the second with `autoRenew` (an active `payment_order` exists, via `findActiveOrder`). Never derive one from the other: a day pass grants access with no agreement behind it, and doing exactly that shipped a `/user` card telling pass buyers "將每月自動續訂" with a cancel button that returned 200 while stopping nothing. The two genuinely disagree for the hours between buying a pass as a subscriber and `housekeep` cancelling the superseded agreement. Fixed 2026-11-10; `deriveSubscriptionView` in `webapp/lib/subscription.ts` is the one place the states are named.
- **`active` is a billing fact; `entitled` is whether paid features are on.** They differ in exactly one state -- a cancelled agreement still inside the period it was paid for -- and that state is the one everything forgets. The server has always gated on the broader question (`requireSubscription` -> `findEntitledSubscription`), so a client reading `active` locks a user out of features the API is serving them: the box page's growth bonus did exactly that until 2026-11-11. `GET /subscription/me` and `POST /user/sync` both report `entitled`; gate subscriber-only UI on it, never on `active`. The admin user listing populates neither it nor `autoRenew` (one query per page each, nothing reads them) -- see the comment on `AdminUser`.
- **A stored period end only includes the 3-day renewal grace if a recurring plan put it there.** `storedEndIncludesGrace` guards both places that chain a new period onto an old one; a day-pass end is exact, so subtracting the grace from it silently eats three paid days. Both directions (pass→agreement, agreement→pass) are covered in `regression/routes/dayPass.test.ts`.
- **A paid pass must stop a live recurring agreement**, or ECPay keeps charging monthly on top of the prepaid days. That cancel happens in the daily `housekeep` sweep (`src/lib/paymentSweep.ts`), derived from state rather than a flag — never inside the webhook, which ECPay gives ten seconds and rate-limits.

- **ECPay's constraints are product constraints.** Cancelling an agreement is *irreversible* — ECPay cannot re-enable one — so "resume subscription" and "change plan at period end" do not exist. Both mean opening a new agreement, whose first charge is immediate. The UI says so; do not reintroduce copy promising a deferred change or "no charge now". Fairness comes from `renewSubscriptionPeriod` starting the new period where the old one was paid up to. Also: credit card only (no 銀聯), `ExecTimes` must be ≥ 2, and six consecutive failed charges terminate the agreement at ECPay's end.
- **Two unrelated auth schemes, same secrets.** The checkout form is signed with a SHA256 `CheckMacValue`; the JSON APIs (cancelling) encrypt `Data` with AES-128-CBC keyed by the same HashKey/HashIV. Mixing them up is the easy mistake. The encoding is .NET's `UrlEncode`, which differs from `encodeURIComponent` for space, `~` and `'` — a mismatch is not an error, just a signature ECPay rejects. `test/lib/ecpay.test.ts` pins this against ECPay's published worked example; if that test ever fails, every order being signed is being rejected.
- **The webhook routes live under `/api/webhook/*`, which has no auth middleware at all.** That is deliberate and the prefix exists so it stays visible: ECPay's server has no Firebase token. Authenticity is `verifyCheckMacValue`. Do not add a user-facing route to this prefix.
- **Never use `c.req.parseBody()` on a webhook.** CloudFront's `/api/*` behaviour forwards only `Authorization` and `Accept`, so the `Content-Type` a form POST carries may not reach the Lambda, and `parseBody` branches on exactly that header. Read `c.req.text()` and parse with `URLSearchParams`. The regression tests post without a Content-Type on purpose.
- **Idempotency is `payment_charge.gwsr` UNIQUE**, not application logic. ECPay retries any notification it did not get the literal body `1|OK` for, so a duplicate must be acknowledged, not reprocessed. Anything that *should* be retried must throw, so the transaction rolls back and the response is a 500. A `SimulatePaid=1` notification is a back-office test replay and must never grant.
- **`RENEWAL_GRACE_DAYS` is added to the stored `current_period_end` but not to the nominal end**, so chaining periods subtracts it back off. Fold it into `nominalPeriodEnd` and twelve renewals hand out 36 free days.
- **Prices live only in `src/lib/subscriptionPlan.ts`**, served to the client by the public `GET /api/info/plans`. The webapp deliberately holds no price constant: the number shown has to be the number signed into the order. A plan whose amount has not loaded renders without a price and cannot be bought.
- `ECPAY_MODE` is an SSM parameter rather than `!If [IsProd, ...]` because `dev.yml` deploys to the **prod stack** on purpose — tying it to the stack name would make an ordinary dev deploy charge real cards. Anything other than exactly `production` means stage.
- A declined *renewal* deliberately changes nothing: ECPay retries, and the period already paid for runs to its end. Nothing writes `past_due` yet, so the frontend's `payment_failed` view is currently unreachable. Dunning is an unmade product decision, not a missing line of code.

#### Advanced analytics (subscriber-only)

`GET /api/analysis/overview` returns `{ progress, forgettingRisk, speed }` in one request, behind `transaction → requireUser → requireSubscription`. The three queries are independent and run concurrently.

- **Do not merge it with the free `/user/stats` and `/user/history`.** Those sit behind `requireUser`, so folding them in would mean demoting this route and deciding entitlement with an `if` inside the handler. A forgotten `if` leaks paid data silently; a forgotten middleware fails loudly. One fewer request is not worth losing deny-by-default.
- Paywalling means **removing the data from the free response**, not hiding the UI. The mastery series was deleted from `GET /user/history` when progress charts became paid, and `user.test.ts` asserts those fields are absent so it cannot silently regress. `/user/history` no longer needs the subject/concept joins that only fed the weighting.
- The forgetting model reuses the **same 7-day decay constant** `reply.ts` already applies to concept mastery (`Math.exp(-deltaDays / 7)`), so risk stays consistent with the mastery shown elsewhere. The multiplier and risk thresholds are the only modelled numbers and are named constants — tune those first if rankings look wrong.
- The speed comparison must use the **same percentile method and the same exclusions** (`too_fast`, `NULL duration_ms`) as `lib/questionStat.ts`, which computes the platform-side medians. A different method on one side shows a gap that is partly just arithmetic.
- `deltaMs` and `platformMedianMs` are **nullable on purpose** — withheld when the platform has too few samples or the user has fewer than `MIN_USER_SAMPLES` timed answers. Render "no comparison yet"; never treat null as 0.
- Query parameters are named for what they bound (`speedDays`, `progressDays`, `riskLimit`). `progress` returns the whole series up to `progressDays` and the client filters its range tabs in place, so widening a tab means widening the request too.

### Frontend

- Use existing components and patterns in `webapp/components/` before creating new ones.
- Keep the App Router split: `page.tsx` stays a server component, interactive logic goes in the sibling `*Client.tsx`.
- Call the API through `webapp/lib/api.ts`; do not hand-roll `fetch` calls or re-implement auth-header handling.
- Response types are generated, not written: change the zod schema beside the handler, run `npm run openapi -w backend_new`, and `webapp/types/api.ts` follows. Do not add a hand-written response type to `packages/shared` -- that is the thing being removed.
- The webapp is exported as a static site and synced to S3 — do not add server-only Next.js features (route handlers, SSR-only APIs, middleware) without flagging it.
- Subscription state comes from `useAuth().subscription`, populated from the `POST /user/sync` response — do not fetch `/subscription/me` again just to gate a block. It is **three-state**: `null` means sync has not answered yet, which is *not* "not subscribed". Render nothing while it is null, or a subscriber sees the locked state flash before their entitlement is known.
- After a mutation, keep the write and the refetch in **separate** `try` blocks. Wrapping both means a failed refresh is reported as a failed action, and the user retries — which for a spend endpoint charges them twice. Report a failed refresh as "the figures may be stale", not as a failure.

#### UI design system and current redesign state

The forest-themed UI redesign is merged into `dev`. It currently covers the shared header and foundations, the gift box page at `/box`, and the learning analysis page at `/analysis`. The home page, smart practice page at `/adaptive`, and answer history page at `/reply` also use the aligned shared header without the old outer page frame or 10px viewport margin.

Keep UI-only work frontend-only unless the task explicitly requires otherwise. Do not change APIs, backend calculations, authentication, permissions, routes, question data, statistics logic, or existing interactions while refining visual presentation.

**Visual direction**

- The product is a mature learning experience set in a warm fantasy world where learning energy nurtures spirits.
- Use deep teal forest tones, glassy blue-green, leaf green, warm gold, cream, and restrained coral accents.
- Illustration style is flat acrylic or opaque gouache, based on the existing deer and bird artwork.
- Keep question, answer, form, table, chart, and dense data areas clean and comfortable for long reading sessions.
- Avoid childish game styling, generic high-saturation SaaS dashboards, dense decoration behind text, cold heavy shadows, and pasted-on illustrations.
- Decorative visual layers must remain subtle, use `pointer-events: none`, and stay below interactive content.

**Shared files and components**

- Design tokens: `webapp/styles/tokens.css`
- Shared header and spirit UI styles: `webapp/styles/spirit.css`
- `/box` layout and hero styles: `webapp/styles/box-hero.css`
- `/analysis` page-specific styles: `webapp/app/analysis/analysis.module.css`
- Shared UI components: `webapp/components/ui/index.tsx`
- Shared spirit components: `webapp/components/spirit/index.tsx`
- Spirit catalog and artwork lookup: `webapp/lib/guardianArtwork.ts`

Reuse these foundations instead of duplicating colors, spacing, radii, surfaces, and interaction states. If a shared component needs page-specific treatment, add an explicit page class or variant rather than changing every consumer.

**Shared header**

- The standard header uses a flat deep-teal background (`--color-spirit-canopy`, no texture or bottom border), a warm-cream logo, gold active state, gold avatar border, and pathname-based navigation state.
- Standard header content aligns to the same `1120px` maximum-width container used by page content, with responsive horizontal insets of 16px, 40px, and 70px.
- Header heights are approximately 80px desktop, 70px tablet, and 62px mobile.
- The mobile menu icon remains 32px square; do not let general button padding shrink its SVG.
- Preserve keyboard `focus-visible` styling separately from the active navigation underline.

**Gift box page (`/box`)**

`/box` is wired to the real API (`GET /guardian`, `GET /store/species`, `POST /store/redeem`, `POST /guardian/:id/invest`); the former `demoData.ts` and its demo-state switcher are gone. Consequences for anyone working on it:

- **Adding, removing or renaming an egg: read `GUARDIAN.md` first.** An egg's identity lives in eight places (one database row, three hardcoded spots in `webapp/lib/guardianArtwork.ts`, five artwork files, the seed script, the table below), and only two of them fail loudly. That file has the step-by-step for a category-bound egg, a VIP egg and a new category, plus what each omission looks like.
- The store and collection read the `guardian` table, so an environment with no rows there shows an empty store. Seven rows are expected, and their `code` slugs must match `artworkByCode` in `webapp/lib/guardianArtwork.ts` for artwork to appear — the live codes are the first column of the table under **Spirit categories** below.
- A code that does not match **fails silently**: the component falls back to the locked egg, nothing logs, nothing fails to build, and the only symptom is artwork that never appears. So shipping artwork is not finished when the files and the mapping are in place — the code has to be checked against the database. `/admin/species` is the fastest check and works in any environment: it lists every `guardian` row beside its artwork, and flags either half missing its counterpart. When the artwork is missing in a deployed environment, check that page before suspecting the deploy; the files and the bundle are easy to verify directly (fetch the `.webp`, grep the page chunk) and are rarely the cause.
- `db/script/v1.0.0/insert_guardian.sql` mirrors the live table as of 2026-10-26, and is the repo's second copy of these codes alongside the table below. It was stale for a while — a renaming left it seeding three codes that no longer existed while four live ones were missing — and nothing detects that, which is how artwork gets wired to a code nobody owns. The table is hand-edited per environment, so when a code changes, update that file and the table below in the same change, and confirm against `/admin/species` rather than against either copy.
- `LEVEL_XP_THRESHOLDS = [2500, 7500, 22500, 67500]` in `src/lib/guardianLevel.ts` (so `MAX_LEVEL` is 5, and a spirit costs 100,000 points end to end — about 2,500 answered questions, or 2-3 months of ordinary use). It was 1,000,000 until 2026-11-10. That total is a product decision rather than a tuning constant: it sets how often someone reaches LV5, and LV5 is what commits the platform to a real donation, so `POINTS.md` holds the derivation and the fact that this number, the donation amount and the subscription price are locked together. Lowering it is the safe direction — stored xp simply goes further; raising it strands users mid-level. Granting points is still not a practical way to reach LV2 while testing: set `user_guardian.xp`/`level` directly.

- The hero uses `/images/spirit-garden-hero.webp` with `cover` and `center bottom`, preserving the lower vine, leaves, eggs, and flowers.
- The page background transitions from deep teal into a warm cream tone.
- The points display is a compact parchment-style plaque with independent vine decorations.
- The three tabs are independent dark-teal capsules with accessible tab semantics and responsive sizing.
- The cultivation view is one connected panel: dark forest spirit display on the left and warm cream controls on the right, stacked on mobile.
- The growth summary shows LV1-LV5. Future stages use the shared locked egg and must not load unreleased character artwork.
- The collection and store always display all seven public-interest categories. Redeemed or in-progress categories sort first; locked categories remain visible afterward.
- The public-support panel (`SupportNote.tsx`) explains that completing LV5 triggers a platform contribution. It no longer hardcodes a figure: the amount is read from `GET /api/info/donation`'s `summary.donationAmount`, so changing the backend's provisional NT$1,000 needs no frontend edit. `DEMO_DONATION_AMOUNT = 100` in `webapp/lib/donationDemo.ts` still exists and belongs to the localStorage design demo alone. That panel also used to promise a NT$5,000 monthly cap, which was never implemented anywhere — the sentence is gone; re-adding it means building the backend rule first.
- The LV5 organization-selection flow is real: `app/box/DonationFlow.tsx` calls `/api/donation`, `/api/charity-organization` and `/api/charity-category`, and `/impact` is the public record. The localStorage demo survives at `/box/donation/?demo=donation` (`DonationDemo.tsx`) with fictional organizations, for design review only — the split is at the route (`donation/DonationRouteClient.tsx`) on purpose, because mixing a localStorage source into the real component is how a demo figure gets rendered as a real promise. A record screen must print `donation.amount`, never today's constant.

**Learning analysis page (`/analysis`)**

- The page uses one continuous low-saturation vertical background gradient from warm cream through sage and misty blue-green to muted lavender. Do not restart the gradient per section.
- Its title/summary scene, cards, chart styles, and RWD rules are page-scoped in `analysis.module.css`; do not leak them into other routes.
- The three summary cards retain real values and calculations. They use 180px desktop, 170px tablet, and 155px mobile heights; mobile stacks them in one column.
- Summary card values and units stay on one baseline. Cards retain subtle borders, 12px radii, and no shadows.
- Large chart/data cards retain their own 16px radii and subtle borders. Do not change chart types, content order, filters, or data behavior during visual-only work.

**Spirit categories**

`guardian.code` is the join between all three of the database row, the `spiritCatalog` species, and the artwork directory. It is data, not code, so this table is the repo's record of it — keep it true when a row is renamed or added.

The *donation category* is no longer this row. It used to be: `guardian.theme` held the seven category names, and the donation feature pointed at `guardian` directly. Categories now live in `charity_category`, and `guardian.category_id` says which one an egg supports (NULL for an egg tied to none, which is how the planned VIP spirit may support any of them). `guardian.theme` stays as the egg's own displayed label — it reads the same as its category's name today, and will diverge once one category holds several eggs. The seven `charity_category.code` values match the seven `guardian.code` values below, which is what `db/script/v1.0.0/insert_charity_category.sql` joins on.

| `guardian.code` | Public-interest category | Spirit | Artwork status | Store egg name |
| --- | --- | --- | --- | --- |
| `children` | 兒少、家庭與婦幼 | 貓 | LV1-LV5 available | 暖陽之蛋 |
| `neurodevelopment` | 身心障礙與神經發展 | 水獺 | LV1-LV5 available | 星光之蛋 |
| `eldercare` | 高齡長照與失智照護 | 狗 | LV1-LV5 available | 長青之蛋 |
| `healing` | 疾病醫療、心理與善終 | 兔子 | LV1-LV5 available | 療癒之蛋 |
| `rights` | 人權、法治、性別與社區 | 海豚 | Pending | 共鳴之蛋 |
| `wisdom` | 教育翻轉、人文與藝術 | 鳥 | LV1-LV5 available | 智慧之蛋 |
| `forest` | 生態環境與動物福利 | 鹿 | LV1-LV5 available | 森林之蛋 |

Until the remaining artwork set exists, its store and locked collection states use the shared egg asset rather than substitute character artwork. Keep spirit artwork data-driven; do not hard-code the UI to a particular spirit. `spiritCatalog` already defines all seven (names and categories); only the `artwork` field distinguishes the ones with drawings, and `spiritImage()` returns `undefined` for the rest so components fall back on their own.

**Image asset policy**

- Runtime raster images in `webapp/public/` use WebP and application code must reference the `.webp` paths.
- Original PNG sources for runtime assets live outside the public web root under `webapp/source-assets/png/`, preserving their relative directory structure.
- Do not reference `webapp/source-assets/` from browser code; it is not publicly served.
- Only commit original PNGs that correspond to assets actually used by the application. Do not commit unused PNG or generated WebP variants unless requested.
- Guardian artwork must be generated directly from its matching original PNG, never by recompressing an existing WebP. Preserve the source dimensions and do not crop or stretch it during conversion.
- Guardian runtime images use lossy VP8 WebP, not lossless VP8L. Use Sharp with `webp({ quality: 85, effort: 6, smartSubsample: true })` so every species is encoded consistently; use a different mode only when a specific asset requirement is documented in the same change.
- After adding or regenerating guardian artwork, verify all output files report VP8 encoding, compare their pixel dimensions with the PNG sources, and visually inspect at least the most detailed image for color shifts, block artifacts, or broken output.
- Current guardian artwork is under `webapp/public/illustrations/guardians/{bird,cat,deer,dog,otter,rabbit}/lv1.webp` through `lv5.webp`.
- Shared runtime assets include `/images/locked-egg.webp`, `/images/points-vine-top-left.webp`, `/images/points-vine-bottom-right.webp`, and `/images/spirit-garden-mobile-leaves.webp`.

**Responsive and accessibility requirements**

- Verify desktop, tablet, and mobile layouts without horizontal scrolling, image distortion, clipped text, overlap, or blocked controls.
- Keep visible keyboard focus, ARIA tab semantics, pathname-based active navigation, and full clickable control areas.
- Support `prefers-reduced-motion` for optional movement.
- Locked eggs use `object-fit: contain` and never reveal future character images.
- For scoped UI changes, run:

```bash
node_modules/.bin/tsc -p webapp/tsconfig.json --noEmit --incremental false
git diff --check
```

The configured frontend lint command is not currently a reliable validation signal. Do not claim full lint success unless the setup is repaired and runs non-interactively.

### Mobile

- `mobile/` is Flutter. Do not edit generated platform scaffolding under `mobile/android/` or `mobile/ios/` unless the task is specifically about native config.
- Follow the existing `lib/pages` / `lib/widgets` / `lib/theme` split.

### Git

- Work only on the assigned branch. `dev` is the default/main branch.
- Do not reset, rebase, force-push, or rewrite other people's commits.
- Do not modify unrelated features.
- Do not commit build output (`dist/`, `out/`, `.next/`, `node_modules/`).

### Deploy

- Do not run `deploy.sh` or any `aws` command unless explicitly asked — it targets real infrastructure.
- CI workflows live in `.github/workflows/`. Note that `dev.yml` intentionally deploys to the `prod` stack, so the workflow name does not tell you which environment it hits.
- Never reference `RestApi` from `ApiFunction`'s `Environment` in `backend_new/aws/cloudformation/template.yaml`. SAM already makes the API depend on the function (`AWS::Serverless::Api` embeds the function's ARN in its generated definition body), so naming the API back makes CloudFormation reject the whole stack with `Circular dependency between resources: [CloudFrontDistribution, RestApiStage, RestApi, ApiFunctionAnyRoutePermissionStage, Route53RecordSet, ApiFunction, RestApiDeployment...]` at changeset creation -- nothing is deployed and the error names seven resources without naming the property that caused it. The API Gateway origin the ECPay callbacks need is read off the invocation event instead (`src/middleware/apiOrigin.ts`).
- `deploy.sh` runs `rm -rf .next out` before building the webapp. Keep it. `next dev` and `next build` share `.next` but produce incompatible output (`next.config.ts` only sets `output: 'export'` when `NODE_ENV=production`), so a local dev run makes the deploy build fail with a misleading error. Two symptoms seen so far: `Cannot find module for page: /_document` during page-data collection, and `Invariant: Expected workUnitAsyncStorage to have a store. This is a bug in Next.js` plus `Cannot read properties of null (reading 'useContext')` during prerender -- the latter names a different page on each run, because pages prerender in parallel, which makes it look like a real and moving bug. **Run `rm -rf .next out` before any local `npm run build` you intend to believe.** The same collision breaks a local build while a dev server is running.

## Flag these to the author

Known debts and easy-to-miss couplings. These need a human decision or an action
outside the repo, so **say so in your reply** when your task touches one instead of
deciding silently or leaving it unsaid. Each has been missed or nearly missed once
already.

| When this comes up | Tell the author |
| --- | --- |
| Anything touches `PUT /user/:id/subscription` | It is a manual-grant backdoor, and ECPay shipping did **not** retire it — keeping it was an explicit call (2026-11-01). An admin can hand out paid access indefinitely, in production. Revisit whether that is still wanted before building on it. |
| Deploying to an environment that has not had `payment_order` / `payment_charge` created | The DDL must be run by hand first (no migration tool). `POST /api/payment/checkout` and both webhook routes query them, so a missing table means **payments are taken at ECPay and never recorded** — the user is charged and gets nothing. Verify the tables exist before pointing ECPay at an environment. |
| Deploying ECPay to a new environment, or going live | Four SSM parameters must exist or the stack will not deploy: `${Project}-${TargetEnvr}-ecpay-merchant-id`, `-ecpay-hash-key`, `-ecpay-hash-iv`, `-ecpay-mode` (today: `castor-prod-ecpay-*`). They must be type `String` — `{{resolve:ssm:…}}` cannot read a `SecureString`. The first three are a matched set with the fourth — stage and production have different merchant ids and keys — so switching to real money means updating all four together, never just the mode. The name scopes the *stack*, the value picks the *ECPay*, so `castor-prod-ecpay-mode` holding `stage` is the correct pre-launch state. |
| Changing an ECPay SSM parameter and expecting it to take effect | `{{resolve:ssm:…}}` is resolved by CloudFormation at stack-update time and baked into the Lambda's environment. A running Lambda does not see the new value until the stack is deployed again — so going live is `put-parameter` **and** a redeploy, and a parameter edited without one leaves the old mode running with no sign of it. |
| The ECPay parameter set or its encoding changes | `CheckMacValue` covers every parameter sent, so adding one without re-signing, or encoding it differently, produces a signature ECPay silently rejects. `test/lib/ecpay.test.ts` holds ECPay's published worked example; keep it passing rather than adjusting it to match new output. |
| Scoring, XP thresholds, egg price, or the adaptive question sampling changes | Read `POINTS.md` first. The three files are coupled with nothing testing the coupling: `reply.ts` scores, `questionStat.ts` feeds it duration medians, and `question.ts`'s sampling is the only reason the Elo gap stays near zero and a question is worth ~100 points at all. Changing the sampling changes the points payout rate without touching `reply.ts`. Points-per-hour reduces to `360000000 / duration_global_stat.median_ms` — that one measured number is the sole multiplier behind every "how long to LV5" estimate, and no API exposes it. |
| Payment, purchasing or anti-cheat work touches points | `PUT /user/:id/points` is a testing backdoor that exists only because points can otherwise be earned solely by answering questions. It is admin-gated and writes a real `ADMIN_ADJUST` ledger row, but it lets an admin mint spendable balance and leaderboard rank indefinitely. Remove it, or restrict it to non-production, before any of that ships. |
| Deploying to an environment that has not had `user_subscription` created | The DDL must be run by hand first — there is no migration tool. `POST /user/sync` reads the table, so a missing table breaks **sign-in for returning users**, not just the paid endpoints. |
| A new `point_transaction` type is written anywhere | Add its Chinese label to `typeLabel` in `webapp/app/user/wallet/WalletClient.tsx`. The fallback renders the raw code (`SPEND_…`) to the user, which is the symptom to look for. |
| New guardian artwork lands under `webapp/public/illustrations/guardians/` | Add the `code → species` entry to `artworkByCode` in `webapp/lib/guardianArtwork.ts`. Artwork is otherwise shipped but never displayed — this happened when the cat set landed. `/admin/species` is the quickest way to see which rows and catalog entries are still unpaired. |
| A new **field** is added to `GET /analysis/overview` | New *routes* under `/api/analysis/*` inherit the paywall from the path prefix; a new *field* does not inherit anything. Confirm the data is meant to be paid before returning it. |
| A range tab on `/analysis` or `/box` is widened | Widen the matching request parameter too (`progressDays` is derived from `DATE_RANGES`). The server trims to what was asked for, so a wider tab would silently show nothing extra. |
| An egg is added, removed or renamed | Read `GUARDIAN.md`. The trap that has no loud failure: `db/script/v1.0.0/insert_charity_category.sql` backfills `guardian.category_id` by joining `charity_category.code = guardian.code`, so a **second** egg in an existing category (whose code necessarily differs) is never matched and keeps `category_id` NULL — which *means* "may support any category", i.e. a silent extra VIP whose owner can direct real money anywhere. Set `category_id` explicitly in the INSERT, and check `/admin/species` for the amber badge afterwards. |
| `QUESTION.md` or `src/lib/questionPrompt.ts` is edited | Both must change together, and the `.ts` copy is a template literal: every backslash needs doubling again (`$\\frac` in the doc is `$\\\\frac` in source), and every backtick needs escaping. A single backslash is a valid JSON escape, so a wrong count corrupts formulas silently rather than failing; a raw backtick ends the literal and at least fails loudly. Verify by printing the runtime string and diffing it against the doc, rather than by reading the source. |
| The serif stack for the Facebook post image changes | Two places must agree: the `body` rule in `backend_new/src/lib/htmlSnapshot.ts`, where webfonts are **mandatory** (Lambda Chromium ships no system fonts at all, so Tinos stands in for Times and LXGW WenKai TC for 楷體), and the 字體 section of the prompt, which names the stacks the AI may emit as inline styles. A font named in the prompt but absent from the snapshot template is silently ignored. Note this is the posted image only — the app itself has **no** serif default for question HTML, so the same markup looks different in the two places. |
| Something outside the Facebook poster needs S3 | Import `src/lib/s3.ts`, never `src/lib/htmlSnapshot.ts`. That module imports `puppeteer-core` and `@sparticuz/chromium`, so importing anything from it drags a headless browser into the importing lambda’s bundle — nothing fails, the bundle just grows by tens of MB. `deleteS3File` is still re-exported from `htmlSnapshot.ts` under its old name so `facebookPoster` and its mocks keep working. Verify with `grep -c sparticuz dist/api/index.js` after `npm run build` (expected: 0). |
| An object is stored in the public bucket under a new prefix | `castor-public-bucket`’s policy grants public `s3:GetObject` on **`questions/*` only**, and the bucket is not managed by this template, so the policy is edited by hand. Anything written outside that prefix uploads successfully and then answers 403 to every browser — a broken image with no error logged anywhere. Keep new objects under `questions/` (figures go to `questions/figures/`) or get the policy widened first. Check with `curl -o /dev/null -w "%{http_code}" https://castor-public-bucket.s3.ap-east-2.amazonaws.com/<key>`. |
| The accepted image types for a question figure change | Two lists must agree: `QUESTION_FIGURE_MIME_TYPES` in `src/routes/question.ts` and `ACCEPTED_MIME_TYPES` in `webapp/components/QuestionFigurePanel.tsx`. It is deliberately narrower than the screenshot uploader’s list, which feeds Gemini: a figure ends up in an `<img>` a student views, so PDF cannot work at all and HEIC/HEIF decode only on Apple platforms — both would upload successfully and then display as nothing. |
| Anything touching the LV5 public-contribution promise | Read `DONATION.md` first — it carries the decisions and their reasons. Six tables and five routes exist — `/api/charity-category` (read-only; the rows are seeded and joined to the egg species by `code`, so new ones go in through SQL), `/api/charity-organization`, `/api/donation`, `/api/info/donation` and the admin-only `/api/donation-batch` — plus two admin pages (`/admin/charity-organization`, `/admin/donation-batch`), the real user flow (`app/box/DonationFlow.tsx`) and the public record at `/impact`. The feature is complete end to end **except** that evidence files are written under the S3 `donations/` prefix, which the bucket policy does not grant public read on yet, so they upload fine and answer 403 to every browser. `GET /api/charity-organization/suggest?categoryId=` picks the least-supported active organisation for a user with no preference — a suggestion only, because the record and the public page both name the organisation, so it is filled into the choose screen rather than decided inside `POST /api/donation`. It is declared before `/:id`; swapping them makes it `Number('suggest')` = NaN. A batch becomes public only through `PUT /api/donation-batch/:id/publish`, which refuses one that transferred less than its donations' subtotal or carries no evidence — `/api/info/donation` reports `platformTopUp` signed rather than clamped because of that guard, so weakening it breaks the public page's arithmetic. The cap is per **species** (`user_guardian`'s UNIQUE), not per category: adding an egg raises every user's ceiling by one donation. `donation.amount` is frozen at confirmation and must never be re-rendered from `DONATION_AMOUNT`. |

## Commands

All backend_new commands run from `backend_new/`.

```
npm run dev                  # local API server (tsx watch local.ts), reads .env.local
npm run db:up / db:down      # local MySQL via docker-compose, seeded from db/table/*.sql
npm run typecheck            # tsc --noEmit on both src and tooling tsconfigs
npm run test:unit            # vitest --dir test (no DB needed — mostly zod schema tests)
npm run test:regression      # vitest --dir regression (needs db:up + .env.local first)
npm test                     # unit then regression
npm run build                # esbuild bundle per-lambda into dist/
npm run openapi              # regenerate openapi.json from the route definitions
```

Run a single test file/case with vitest directly, e.g. `npx vitest run test/routes/category.schema.test.ts` or `npx vitest run regression/routes/category.test.ts -t "some test name"`.

Regression tests share one MySQL pool and truncate tables between cases, so `vitest.config.ts` forces `fileParallelism: false` — don't try to parallelize regression runs.

webapp: `npm run dev` / `build` / `lint` from `webapp/`.
Root: `npm run dev` starts the webapp via `next dev webapp`.

Deploy: `./deploy.sh <env>` (run from repo root, requires AWS creds) — builds+typechecks `backend_new`, packages/deploys its CloudFormation stack, then builds and syncs the webapp to S3. `dev.yml` deploying to the `prod` stack is deliberate (no real users yet; a proper dev/prod split is planned post-launch).

## backend_new architecture

**Request pipeline** (`src/app.ts`): a single Hono app composes route groups behind per-path middleware chains — `adminAuth`/`requireAdmin` (Firebase-token-gated, admin allowlist), `transaction` (wraps the whole request in a Drizzle transaction), and `requireUser` (resolves the Firebase token to an app `userTable` row). Middleware order matters: `requireUser` must run after `transaction` because it reads `c.get('db')`.

- **Auth convention**: the frontend sends the raw Firebase ID token as the `Authorization` header value directly (no `Bearer ` prefix) — both `adminAuth` and `requireUser` rely on this.
- **`adminAuth`** only gates mutating methods (POST/PUT/DELETE) against a hard-coded email allowlist (`ADMIN_EMAILS` in `src/middleware/adminAuth.ts`) — GETs pass through. `requireAdmin` gates everything, for PII-bearing resources.
- **`requireSubscription`** must run after `requireUser` (it reads the resolved user row) and gates the subscriber-only `/api/analysis/*`. See *Subscription and paid features* above before changing anything it depends on.
- **`transaction`**: every request in a transaction-wrapped route runs inside one Drizzle `db.transaction()`. Because Hono's `onError` intercepts thrown errors before they propagate back through the callback, the middleware checks `c.error` after `next()` and rethrows it so Drizzle rolls back instead of auto-committing — don't remove that check when touching this file.
- **`requestLogger`**: best-effort, fires an SQS message to `polaris-<env>-logger-queue` — a queue owned by another project, which is why no template here defines it and why deleting the legacy backend did not affect it. It's a no-op locally (`@hono/node-server` doesn't populate `c.env.event`) and only acts on real API Gateway REST events.
- **Errors**: routes throw subclasses of `HttpError` (`src/model/error/*`); `toErrorResponse` (`src/lib/errorResponse.ts`) maps them to `{status, name, message, code}` JSON in the app's `onError` handler. Anything not an `HttpError` becomes a generic 500.
- **DB access**: `getDb()` (`src/db/client.ts`) lazily creates one connection pool per warm Lambda container and never tears it down between invocations — pool size is capped via `DB_POOL_SIZE` per-container, not globally, so raising it multiplies against concurrent warm containers. `closeDb()` is test-only teardown.
- **Routes** (`src/routes/*.ts`) are self-contained Hono sub-apps: zod schemas for validation, Drizzle queries, exported for reuse in tests. Multi-entity reads (e.g. `category`'s `/:id/subject`) favor a few flat batched queries over N+1 composition.
- **Lambda entrypoints** (`src/lambda/*.ts`): `api.ts` (main API), `facebook.ts` (Puppeteer/Chromium-based poster), `housekeep.ts`, `questionStat.ts` — separate bundles per `package.json`'s `build:*` scripts, deployed as separate Lambdas in the CloudFormation template.

## The OpenAPI document

`backend_new/openapi.json` is generated by `npm run openapi` (`tools/openapi.ts`) from the route definitions. **Never edit it by hand**, and regenerate it in the same change as any route it covers.

It exists because the response types in `packages/shared` were a claim, not a contract: no route imported them, so nothing checked that the server sends what the webapp is built against. The plan is that the webapp (and later a Flutter client) consumes types generated from this document instead. Started 2026-11-12; 24 of the 25 route groups are done (72 paths) -- `guardian`, `subscription`, `user`, `info`, `category`, `subject`, `exam`, `concept`, `conceptGroup`, `tag`, `filterDimension`, `filterOption`, `charityCategory`, `charityOrganization`, `wallet`, `store`, `species`, `donation`, `donationBatch`, `reply`, `wrongQuestion`, `analysis`, `payment` and `question` -- and the only one left is `webhook`, which answers ECPay in plain text (`1|OK`) rather than JSON and is not a client-facing API: describing it would add nothing a client could use and would put the callback surface in a document. Leave it undescribed unless something changes. `question`'s own routes are not described yet, but its `questionDetailSchema` is: that shape is embedded by `/reply`, `/wrong-question` and `/question/adaptive`, so it had to come first, and it lives in `src/routes/question.ts` rather than in any one consumer (one of which, `webhook`, answers ECPay in plain text and may never belong in a client document), and **an undocumented route is absent from the document entirely** — so the path count `npm run openapi` prints is the migration's progress, not the size of this API.

It is written to a file, not served. A document listing every endpoint including the admin ones is a map of the attack surface, and no client needs it at runtime.

**The stack, and why not the obvious one**: `hono-openapi` + `zod-openapi@^4`. `@hono/zod-openapi` is the better-known choice but its current major requires zod `^4.0.0`, and this repo is on zod 3 (`zod@^3.24.1`); its last zod-3 line, `0.19.x`, is a dead end. `hono-openapi` is middleware, so routes keep their shape and migrate one at a time, and `zod-openapi@4` (peer `zod@^3.21.4`) is what converts the schemas. Revisit when zod 4 happens — zod 3.25 already ships the `zod/v4` subpath, so that migration can also be incremental.

**To migrate a route group** (`src/routes/guardian.ts` is the worked example):

1. Define the response as a zod schema in the route file, exported. Use `.describe()` on anything a client author would wonder about — it reaches the document, but **only because `tools/openapi.ts` imports `zod-openapi/extend` for its side effect**. Without that import every description is silently dropped and the document still generates, which is how the first version of it was written with no field documentation at all.
2. Infer the DTO type from the schema (`type GuardianDto = z.infer<typeof guardianSchema>`) instead of writing it twice.
3. End the handler's `c.json({...})` with `satisfies z.infer<typeof theSchema>`.
3b. **Map the row field by field** -- a `toXDto(row)` function -- rather than returning `db.select()` or spreading it. `satisfies` does not save you here, and the exact rule is worth knowing because two plausible-looking shapes both slip through. Excess-property checking reaches only properties *written out* in an object literal: it does not reach a bare variable (`c.json(row satisfies S)`), and **it does not reach a property arriving through a spread** (`c.json({ ...row, extra } satisfies S)`). Both verified with a probe. That is how `subject.duration_median_ms` and `question.duration_median_ms` reached every client of six endpoints between them. The regression key-set test in step 6 is the other half of this, and it is the half that actually holds.
4. Hoist the `describeRoute({...})` into a named const above the routes, so handler bodies keep their indentation (this workspace has no prettier). State each route's gate in its own entry, and check which one it is: **`adminAuth` gates POST/PUT/DELETE only**, so every read in a group mounted behind it answers with no credentials at all, while `requireAdmin` gates every method. Documenting a whole group as "admin only" because of its mounting is wrong for exactly half of it.
5. Add `test/routes/<name>.contract.test.ts` with `expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<TheSharedType>()`. These are compile-time only, so `npm run typecheck` is what enforces them.
6. Add a regression test that the live body parses against the schema **and** that its key set is exactly what the schema lists — zod strips unknown keys rather than rejecting them, so a column added to a query and spread into a DTO would otherwise pass while appearing in no document.
7. `npm run openapi`.

The two guards catch different things: `satisfies` catches a handler returning something the schema rejects, and the contract test catches the schema and the hand-written shared type describing different shapes. Both were verified by mutation.

**What the migration has turned up so far.** Every one of these is a response that sends less than `packages/shared` claims, and has since it was written -- nothing ever compared the two. The schemas are the honest side, and `test/routes/user.contract.test.ts` states each gap as an `Omit<...>` the compiler checks, so completing (or further trimming) a response forces that line to be re-stated:

- `GET /api/user` (admin listing) sends `subscription` with `active`, `plan`, `expiresAt` only. `entitled` and `autoRenew` would each be another query per row; the listing only shows and toggles billing. Deliberate.
- `POST /api/user/sync` sends those three plus `entitled`, but no `autoRenew` -- one `findActiveOrder` per sign-in if it is ever wanted. Not a live bug: the only caller of `deriveSubscriptionView` feeds it from `GET /subscription/me`, not from sync.
- `PUT /api/user/:id/subscription` sends billing only, like the listing.
- `GET /api/user/stats` sends categories as `{ id, name }`, while shared types them as the full `Category` (which carries `createdAt`).
- `GET /subscription/me` reported `expiresAt` as a `Date` object that `c.json` happened to serialise, while every type in the repo called it a string. Fixed by serialising explicitly -- identical bytes, honest type. The same was true of `lastLoginAt`, `createdAt` and `updatedAt` on every user response, and of `transferredAt` on every batch in the public donation record.
- `GET /api/subject/{id}`, `POST /api/subject` and `PUT /api/subject/{id}` were all sending `duration_median_ms` -- the per-subject median reply time the points time-weight reads -- because they returned `db.select()` unexamined. Described by no type, read by no client, and publicly readable (`adminAuth` lets GET through). Now absent: the handlers go through a DTO that lists its fields. Three regression tests catch it coming back, two of which existed already and passed either way because they compared one response against another rather than against a description.
- `packages/shared`'s `Subject`, `Exam`, `Tag` and `ConceptGroup` claim relations the API has never sent, including mutually recursive ones (`Exam.subject: Subject[]`, whose `Subject.exams: Exam[]` comes straight back). The webapp imports none of them -- of this group it imports only `Category` -- which is why nobody noticed. `test/routes/catalog.contract.test.ts` states the real shapes against them as `Pick<...>`.
- The admin list responses (`GET /api/subject`'s `categories` CSV, `GET /api/exam`'s `subjects` CSV) are described by no shared type at all. Their shapes are declared privately in the client components that read them -- `SubjectDto` in `SubjectClient.tsx`, `ExamDto` in `ExamClient.tsx` -- which is a fifth place a response shape is written down. Step D replaces those too.
- `packages/shared`'s `Concept`, `ConceptGroup` and `Tag` each claim a relation the API has never sent -- an embedded parent object, and for `ConceptGroup` its `concepts` as well. The admin UI resolves every one of them from a list it fetches separately.
- `FilterOption` is worse than overstated, it is wrong: it has `dimension: FilterDimension` and **no `dimensionId`**, while the API sends `dimensionId` and no `dimension`. A client written against that type would read `undefined` and have nothing to group options by. `FilterDimension` beside it is exactly right, and is the only one of these five types that is.
- `filter_dimension` and `filter_option` have no `created_at` column, unlike every other table in that part of the schema, so those two responses carry no timestamp. Worth knowing before adding one "for consistency".
- Deleting a row something still references answers **500**, not 409. The cascade is deliberately absent (a concept group still holding concepts, a dimension still holding options), but the driver's foreign-key error is unmapped, so `toErrorResponse` falls through to Internal Server Error. The documents say so rather than pretending; mapping it to a 409 is a behaviour change and its own task.
- `question` had the same `duration_median_ms` leak `subject` did, through `GET /api/question/{id}`, `POST /api/question` and `PUT /api/question/{id}` -- all three returned the row. The reads in that group are open (`adminAuth` gates writes only), so it was publicly readable. Gone now; the handlers go through `toQuestionRowDto`.
- **`GET /api/question` and `GET /api/question/{id}` are open and include the answer key.** That is a decision already taken and accepted, not an oversight: the reads in this group are deliberately ungated and the key rides along. Do not re-raise it. `GET /api/question/adaptive` is the one that must never carry it, and it masks every answer with bullets of the same length -- which keeps what the client depends on (truthiness, and `answer.length` for a FILL question's blank count) without handing over the key.
- The admin question list sends `subject` as a **name**, while `Question` declares `subject: Subject`. A client reading `question.subject.name` gets `undefined`.
- `PostQuestionResponse` is `Question[]`, one dimension short: the response is an array *per submitted question*, each holding the question and then its children, because a 題組 and its sub-questions are one submission. `created[0].id` reads an array, not a number.
- Seven of `question`'s fifteen routes are described by no shared type at all (`/count`, `/image`, `/image/figure`, `/image/prompt`, `/{id}/enabled`, `/{id}/tag`, `/{id}/concept`).
- `GET /api/analysis/overview` spread `user_concept_stat` rows into the forgetting-risk list, so `lastAttemptAt` went out as a Date while `ForgettingRiskItem` said string. Every other type in that response matched. Worth noting what the spread meant here specifically: this is the subscriber-only route, so a column added to `user_concept_stat` or `reply` would have become part of a paid response without anyone describing it.
- **`packages/shared`'s `Question` is the widest type in the package and no response has ever matched it.** Six fields it claims are never sent (`subject`, `enabled`, `attempCount`, `scoringTotal`, `createdAt`, `updatedAt`) and five more are sent reduced: `exam` and `tag` as id and name, `concept` as id, name and its group's id and name, `children` as the eight scalars a sub-question has of its own, and `type` as a `string`. Three responses embed it, so `test/routes/reply.contract.test.ts` states the real shape once, as `ActualQuestion`, and every assertion there is checked against it.
- `DayPassPurchase.choosePayment` and `.status` are the second case of **shared being narrower than the column**. Both are varchars; the sets really are closed in practice, since `payment_purchase` is written by this backend alone and always through the exported constants, but the database does not hold them. A `z.enum` was rejected by `satisfies` on the handler -- the guard working, not an inconvenience -- so the schemas say `string` and put the values in the descriptions.
- **Nothing secret is in the document, and `GET /api/payment/checkout`'s response is where to check that.** `params` carries the form fields ECPay names, `CheckMacValue` among them, and that value is a signature *over* those fields: the HashKey and HashIV it is computed with never leave the server. `openapi.json` contains zero occurrences of either, which is worth re-checking whenever this group changes. ECPay's field names stay untranslated, and a client must POST every field verbatim -- editing one invalidates the signature.
- `type` is the one case where **shared is narrower than the data supports**: it types the six-value union, while the column is a `varchar` and these rows predate this backend. A response cannot promise one of the six, so the schema says `string` and describes the six. A client narrowing on that union would be trusting a constraint the database does not hold.
- `ReplyGroup.subject` is typed as the full `Subject` -- with its `exams`, `tags`, `conceptGroups` and `category` -- and has always been `{ id, name }`. `ReplyGroup.children` is typed `Reply[]`, thirteen fields including the user id, a second copy of the subject and the parent question embedded again; the response sends seven.
- `PutWrongQuestionNoteResponse.updatedAt` is `string | null`, but that response *is* the write that just happened, so it is never null. Another case of shared being wider than the truth, which costs a client a null check it can never hit.
- **A left join widens every column it brings in, `NOT NULL` ones included.** `GET /api/donation` builds `batch` only when `batchId` is set, but drizzle types `batchTransferredAt` as `Date | null` and `batchPublished` as `boolean | null` all the same -- TypeScript cannot see that one field narrows its siblings -- so the response was typed `transferredAt: Date | null, published: boolean | null` while `DonationBatchRef` said `string` and `boolean`. Fixed by checking all three together in `toDto` rather than with a non-null assertion, which makes the narrowed type the one the document carries. Worth remembering for the remaining groups: `reply` and `analysis` both left-join.
- `donationBatch.ts` had its own `EvidenceDto` with `createdAt: Date | null` while `DonationBatchEvidence` in packages/shared said `string | null`. Both were written down, on the two sides of the same response, and nothing compared them. This is the whole argument for the migration in one field.
- Otherwise every type in the donation feature matched, relations included -- unlike the catalog and taxonomy groups. These are the shapes the donation screens were built against while the feature was being written, so they were read, which keeps being the difference.
- `GuardianSpecies` is the first gap found in the other direction: the response sends **more** than the type admits. `GET /api/store/species` has sent `level` since the collection view needed it -- it shows progress per species and sorts the started ones first -- and the type has never had the field, so `BoxClient.tsx` declares its own `SpeciesDto` and ignores the shared one. A type that is missing something gets worked around silently; one that overstates is not noticed at all. Neither gets fixed while nothing compares it to the server.
- `GET /api/species` built `ownersByLevel` as `Record<number, number>`, which no JSON response can be -- object keys are strings, and the admin page that reads it says `Record<string, number>`. The schema says string and the handler now agrees.
- `CharityOrganization`, `CharityCategoryRow` and `PostStoreRedeemResponse` are right, relations included: `categories` really is the `{ id, code, name }` the type claims. Not every hand-written type here is wrong, and the ones that are not are mostly the ones something reads.
- `charityCategory` is GET-only and mounted behind `adminAuth`, which gates POST/PUT/DELETE -- so on that group it gates nothing. That is intended (the names are printed on the public transparency page, and the rows are seeded by SQL because they are tied to the spirit species by `code`), and the document says so. `species` is the opposite case: also GET-only, and mounted behind `requireAdmin` for exactly that reason.
- `info` is the exception that says something: all four of its typed responses matched `packages/shared` exactly, first try. They are the public endpoints a visitor sees before signing in, so a response that did not match would have shown up as a wrong landing page immediately. The lies were all behind `requireUser` or `requireAdmin`.

**41 schemas are named**, not inlined: a response shape that more than one route uses, or that a client will want a name for, carries `.openapi({ ref: 'Name' })` beside its definition, which puts it in `components.schemas` and makes every use a `$ref`. That took the document from 399 KB to 241 KB and is what lets generated client types be named rather than 41 anonymous structural blobs. Two things to know when adding one:

- The file needs `import 'zod-openapi/extend';` of its own. The patch has to be in place before `.openapi()` runs, which is while the module is being evaluated, so importing it once somewhere central would make the generated document depend on `app.ts`'s import order. All 25 of those imports together cost 1.3 KB of Lambda bundle, because zod-openapi is already in there via hono-openapi's resolver.
- `.extend()` and `.pick()` produce a new schema, which loses the ref and inlines. That is why the list rows (`GET /api/subject`'s `Subject` plus `categories`, and the others like it) are anonymous objects in the document. Each is used once, so naming them would buy little; expressing them as `allOf` would mean `z.intersection`, whose inferred `A & B` fights the flat `satisfies` on the handler.

**Requests are not in the document yet** — only responses. Query parameters and request bodies are validated by `@hono/zod-validator`, which `hono-openapi` cannot see: documenting them means moving all 65 `zValidator` call sites onto `hono-openapi`'s own `validator`, and that also changes the 400 body an invalid request gets. Worth doing, but as its own change rather than inside a route-group migration.

**The webapp consumes it.** `webapp/types/api.ts` used to be `export * from '@castor/shared'`; it is now ~45 aliases into `webapp/types/openapi.d.ts`, which `npm run api:types -w webapp` generates from `backend_new/openapi.json`. A response shape the webapp compiles against therefore cannot disagree with what the server sends unless the server changed first. Aliases rather than deep paths at the call sites, because `operations['getApiReply']['responses'][200]['content']['application/json']` is unreadable in an error message, and an operationId should have one place to change.

**`openapi.d.ts` itself is not in git.** It is gitignored beside `next-env.d.ts`, and four hooks in `webapp/package.json` regenerate it -- `postinstall`, `predev`, `prebuild`, `pretypecheck` -- so a fresh clone has it after `npm install`, and `deploy.sh`'s own `npm install` and `next build` each produce it again before anything needs it. The reason `openapi.json` is committed does not carry over: that document is in git because the CI drift gate can only diff a file that is in git, and because it crosses the workspace boundary -- `api:types` reads `../backend_new/openapi.json`, so committing it keeps the webapp's build depending on one JSON file rather than on the backend's source and toolchain. `openapi.d.ts` is a pure function of a file that is already gated, its diff says nothing that document's diff does not, and it is 6,800 lines. One committed layer per truth; the derivations below it are hooks.

Switching it over broke exactly three things, which is the measure of how load-bearing the hand-written types actually were:

- `AuthContext` typed its subscription state `SubscriptionStatus`, but it is set from two sources that do not agree: `POST /user/sync`, which omits `autoRenew`, and `GET /subscription/me`, which carries it. It is now typed as sync's own shape, derived rather than written out, so it widens by itself if sync ever sends the fifth field. Nothing read `autoRenew` from there -- the two screens that need it fetch `/subscription/me` themselves.
- `AdaptiveClient` passed a 題組's sub-question to two components typed for a whole `Question`. That only ever compiled because the old `Question.children` was `Question[]`, a recursion the API has never sent. Both take the five and two fields they actually read now.

Two things in that file are still hand-written, and marked so: `Paginate<T>`, because OpenAPI has no generics, and the two request bodies, because the document describes responses only.

**The growth bonus is served, not compiled in** (`GET /api/info/growth`, added 2026-11-13). It was the webapp's last import from `packages/shared` -- two functions and a `SUBSCRIBER_XP_BONUS_PERCENT` -- and sharing a constant through a package only worked because both halves were built from one checkout. The rate is now the server's: `webapp/hooks/useGrowthBonus.ts` reads it like `usePlanAmounts` reads the prices, and `webapp/lib/invest.ts` holds the arithmetic but no rate, taking it as an argument. `webapp/package.json`, `tsconfig.json` and `next.config.ts` no longer mention `@castor/shared` at all.

Worth knowing what that turned up: the constant was shared, but the *statements about it* were not. Four places across two screens wrote the rate into their own JSX -- the box screen's invest banner and its confirm dialog's badge, and on the subscription page both the benefit section and the FAQ, each of which also wrote out "100 積分 → 110 XP" by hand. Changing `SUBSCRIBER_XP_BONUS_PERCENT` would have changed what users were granted while all four went on advertising ten percent, which is a worse failure than the one sharing the constant prevented: the server would have been right and every screen wrong. All four are derived now, and both worked examples run through `investmentXp`.

`null` from `useGrowthBonus` means "not known yet", never "no bonus", and the two screens answer it differently on purpose. The subscription page shows a placeholder where the rate goes, exactly as it does for a price that has not arrived, because the benefit is that page's subject. The box screen states nothing and lets the slider cap at the raw XP gap -- the same thing it shows someone with no paid access, and the same thing it already showed for the moment before `POST /user/sync` answers -- so a failed rate fetch cannot become an error that hides the spirits. `effectiveBonusPercent` is the one place those two reasons for "no bonus" collapse into one.

**No tests cover `webapp/lib/invest.ts`**, because the webapp has no test runner configured. `backend_new/test/lib/guardianLevel.test.ts` covers the copy in `packages/shared`, which is still what the server uses. Both need to end up in one place with one suite; that is part of the sunset, not done here.

**CI regenerates it and fails on a diff** (`dev.yml` and `prod.yml`, the step before the AWS credentials are configured). Without that, the generated file would rot exactly like the hand-written types it replaces -- a stale document is a wrong type that compiles. The step needs no secrets and no database: `getDb()` is lazy, so importing the app composes the routes without connecting, and `deploy.sh` runs its own `npm install` afterwards, so the install is moved earlier rather than duplicated.

It gates the deploy because it is in the same job, ahead of `sh deploy.sh`, alongside `npm run test:unit -w backend_new` — 229 tests in nine seconds, needing no database and no secrets — and `npm run typecheck -w webapp`, which is the other half of the same gate: the webapp's types come from that document, so this is what proves the document and its consumer still agree. That one is before the AWS credentials for a reason of its own, the deploy **order**: `deploy.sh` releases the backend first and builds the webapp second, so a webapp type error that only `next build` catches leaves a released backend with no matching webapp.

**The 788 regression tests do not run in CI**: they need a MySQL service container with the schema loaded, which is its own change. So a release is blocked by a backend type error (`pre:deploy` runs `typecheck`, which is also what enforces the `*.contract.test.ts` assertions), by a webapp type error, by a failing unit test, and by a stale document — and by nothing else. Anything that only the regression suite covers reaches production unchecked.

## Testing

- `test/` — fast, no external deps (zod schema shape tests, error model, error-response mapping).
- `regression/` — hits the real Hono app against local MySQL (seeded via `docker-compose.yml` from `db/table/*.sql`); requires `npm run db:up` and a `.env.local` with `DB_HOST`/`DB_PWD`/`PROJECT`/`PORT` set first.
- Coverage excludes the `src/lambda/*` entrypoints on purpose — they're thin wiring, not branching logic worth measuring.

## Chromium Lambda layer

`facebook.ts` needs the arm64 `@sparticuz/chromium` binary as a Lambda layer, published once per AWS region (see root `README.md` for the exact commands) and passed to deploys via a `CHROMIUM_LAYER_ARN` secret.
