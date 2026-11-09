# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.

## Project structure

npm workspaces monorepo (`webapp`, `backend`, `backend_new`, `packages/*`):

- `backend_new/` — **active** backend (Hono + Drizzle ORM + MySQL, deployed as AWS Lambdas). Do new backend work here.
- `backend/` — legacy backend (TypeORM + Inversify). Being phased out; avoid adding to it unless asked.
- `webapp/` — Next.js 15 (App Router) admin/user web frontend.
- `mobile/` — Flutter app.
- `db/` — raw SQL table definitions (`db/table/*.sql`), also used to seed the local Docker MySQL for `backend_new` tests.
- `packages/shared` (`@castor/shared`) — TS shared between `backend_new` and `webapp`.
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
- `backend/` (legacy) entities in `src/model/entity/` are not the source of truth; do not add tables there.
- There is no migration tool. A new table in `db/table/*.sql` reaches a real environment only when someone runs the DDL by hand, and reaches the local test DB only on a fresh volume (`docker-entrypoint-initdb.d` does not re-run) — so also add the file to `backend_new/docker-compose.yml` and tell the user to run it against prod. Say so explicitly when a deploy would otherwise ship code that queries a table that is not there yet.

### Backend

- Do new backend work in `backend_new/`. Treat `backend/` as legacy — change it only when the task explicitly targets it.
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

Recurring billing runs through ECPay's *credit-card periodic* product: the cardholder authorises once and ECPay charges on its own schedule, notifying `PeriodReturnURL` each time. `backend_new/src/lib/ecpay.ts` owns the wire format, `payment_order` is one row per agreement and `payment_charge` one row per authorisation.

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
- Keep response types in `webapp/types/api.ts` (or `packages/shared`) in step with backend changes.
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
- Level thresholds are large (`LEVEL_XP_THRESHOLDS = [25000, 75000, 225000, 675000]` in `src/lib/guardianLevel.ts`, so `MAX_LEVEL` is 5). Granting points is not a practical way to reach LV2 while testing — set `user_guardian.xp`/`level` directly. The total has been **decided down to 100,000** (2026-11-08) and the constant has not been changed yet — so these four numbers are stale, and `guardian.test.ts` / `charityOrganization.test.ts` hardcode values derived from them. `POINTS.md` carries the decision, the scaled ladder (2,500 / 7,500 / 22,500 / 67,500) and what it means in practice: about 2,500 answered questions, or 2-3 months of ordinary use, per spirit.

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
- `deploy.sh` runs `rm -rf .next out` before building the webapp. Keep it. `next dev` and `next build` share `.next` but produce incompatible output (`next.config.ts` only sets `output: 'export'` when `NODE_ENV=production`), so a local dev run makes the deploy build fail during page-data collection with a misleading `Cannot find module for page: /_document`. The same collision breaks a local `npm run build` while a dev server is running.

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
| Shared types in `packages/shared` change | `backend/` (legacy) has not compiled for some time (10 errors, 8 of them pre-dating recent work). Do not "fix" it unasked, and do not read new errors there as a regression you caused. |

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
- **`requestLogger`**: best-effort, fires an SQS message to the same queue/consumer as the legacy backend. It's a no-op locally (`@hono/node-server` doesn't populate `c.env.event`) and only acts on real API Gateway REST events.
- **Errors**: routes throw subclasses of `HttpError` (`src/model/error/*`); `toErrorResponse` (`src/lib/errorResponse.ts`) maps them to `{status, name, message, code}` JSON in the app's `onError` handler. Anything not an `HttpError` becomes a generic 500.
- **DB access**: `getDb()` (`src/db/client.ts`) lazily creates one connection pool per warm Lambda container and never tears it down between invocations — pool size is capped via `DB_POOL_SIZE` per-container, not globally, so raising it multiplies against concurrent warm containers. `closeDb()` is test-only teardown.
- **Routes** (`src/routes/*.ts`) are self-contained Hono sub-apps: zod schemas for validation, Drizzle queries, exported for reuse in tests. Multi-entity reads (e.g. `category`'s `/:id/subject`) favor a few flat batched queries over N+1 composition.
- **Lambda entrypoints** (`src/lambda/*.ts`): `api.ts` (main API), `facebook.ts` (Puppeteer/Chromium-based poster), `housekeep.ts`, `questionStat.ts` — separate bundles per `package.json`'s `build:*` scripts, deployed as separate Lambdas in the CloudFormation template.

## Testing

- `test/` — fast, no external deps (zod schema shape tests, error model, error-response mapping).
- `regression/` — hits the real Hono app against local MySQL (seeded via `docker-compose.yml` from `db/table/*.sql`); requires `npm run db:up` and a `.env.local` with `DB_HOST`/`DB_PWD`/`PROJECT`/`PORT` set first.
- Coverage excludes the `src/lambda/*` entrypoints on purpose — they're thin wiring, not branching logic worth measuring.

## Chromium Lambda layer

`facebook.ts` needs the arm64 `@sparticuz/chromium` binary as a Lambda layer, published once per AWS region (see root `README.md` for the exact commands) and passed to deploys via a `CHROMIUM_LAYER_ARN` secret.
