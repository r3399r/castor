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
- Data backfills/seeds belong in `db/script/<version>/`, not in application code.
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

- **Access is `status = 'active'` AND `current_period_end > NOW()`**, never status alone. A lapsed period therefore stops granting access by itself, with no sweeper job to run and nothing to break if one is ever missed. Do not "simplify" this to a status check and add a cron to compensate — that trades a design that cannot fail for one that can.
- A consequence: a naturally-lapsed row keeps saying `status = 'active'` forever. That is harmless for access and for `/subscription/me`, but `GET /subscription/history` returns the raw column, so a past period can display as active. Derive the display status at read time if that matters; do not add a sweeper for it.
- `at most one active row per user` is enforced by the database, not by application code: `active_user_id` is a generated column (`IF(status='active', user_id, NULL)`) with a UNIQUE index, since MySQL has no partial indexes and UNIQUE ignores NULLs. It exists because a retried payment webhook is the realistic way two live subscriptions get created. `setSubscription` must therefore close a lapsed-but-still-`active` row before inserting a new one.
- `requireSubscription` (`src/middleware/requireSubscription.ts`) runs after `requireUser` and throws 403 with code `SUBSCRIPTION_REQUIRED` — distinct so the frontend can show an upgrade prompt rather than a generic failure. 401 would be wrong: the caller is authenticated, just not entitled.
- `GET /subscription/me` and `/history` sit behind `requireUser` only and must stay that way. They are what a non-subscriber calls; gating them would mean the only way to discover you are not subscribed is to be refused.
- `PUT /user/:id/subscription` (admin only, idempotent both ways) exists **only because there is no payment integration yet**. When payments arrive, entitlement should be driven by provider webhooks and this route removed or restricted to non-production. It must never become callable by a user on their own account.
- Subscription status is folded into `POST /user/sync` and the admin `GET /user` listing so sign-in and the admin table cost no extra request. The listing uses one batched query for the page, not one per row.

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

`/box` is wired to the real API (`GET /guardian`, `GET /store/species`, `POST /store/redeem`, `POST /guardian/:id/invest`); the former `demoData.ts` and its demo-state switcher are gone. Two consequences for anyone working on it:

- The store and collection read the `guardian` table, so an environment with no rows there shows an empty store. Seven rows are expected, and their `code` slugs must match `artworkByCode` in `webapp/lib/guardianArtwork.ts` for artwork to appear. `/admin/species` shows both halves side by side and flags either one missing its counterpart.
- Level thresholds are large (`LEVEL_XP_THRESHOLDS = [25000, 75000, 225000, 675000]` in `src/routes/guardian.ts`, so `MAX_LEVEL` is 5). Granting points is not a practical way to reach LV2 while testing — set `user_guardian.xp`/`level` directly.

- The hero uses `/images/spirit-garden-hero.webp` with `cover` and `center bottom`, preserving the lower vine, leaves, eggs, and flowers.
- The page background transitions from deep teal into a warm cream tone.
- The points display is a compact parchment-style plaque with independent vine decorations.
- The three tabs are independent dark-teal capsules with accessible tab semantics and responsive sizing.
- The cultivation view is one connected panel: dark forest spirit display on the left and warm cream controls on the right, stacked on mobile.
- The growth summary shows LV1-LV5. Future stages use the shared locked egg and must not load unreleased character artwork.
- The collection and store always display all seven public-interest categories. Redeemed or in-progress categories sort first; locked categories remain visible afterward.
- The public-support panel explains that completing LV5 triggers a platform contribution and highlights `NT$10`; do not implement or change contribution logic as part of UI work.

**Learning analysis page (`/analysis`)**

- The page uses one continuous low-saturation vertical background gradient from warm cream through sage and misty blue-green to muted lavender. Do not restart the gradient per section.
- Its title/summary scene, cards, chart styles, and RWD rules are page-scoped in `analysis.module.css`; do not leak them into other routes.
- The three summary cards retain real values and calculations. They use 180px desktop, 170px tablet, and 155px mobile heights; mobile stacks them in one column.
- Summary card values and units stay on one baseline. Cards retain subtle borders, 12px radii, and no shadows.
- Large chart/data cards retain their own 16px radii and subtle borders. Do not change chart types, content order, filters, or data behavior during visual-only work.

**Spirit categories**

| Public-interest category | Spirit | Artwork status | Store egg name |
| --- | --- | --- | --- |
| 兒少、家庭與婦幼 | 貓 | LV1-LV5 available | 暖陽之蛋 |
| 身心障礙與神經發展 | 水獺 | Pending | 星光之蛋 |
| 高齡長照與失智照護 | 狗 | Pending | 長青之蛋 |
| 疾病醫療、心理與善終 | 兔子 | Pending | 療癒之蛋 |
| 人權、法治、性別與社區 | 海豚 | Pending | 共鳴之蛋 |
| 教育翻轉、人文與藝術 | 鳥 | LV1-LV5 available | 智慧之蛋 |
| 生態環境與動物福利 | 鹿 | LV1-LV5 available | 森林之蛋 |

Until the other four artwork sets exist, their store and locked collection states use the shared egg asset rather than substitute character artwork. Keep spirit artwork data-driven; do not hard-code the UI to a particular spirit. `spiritCatalog` already defines all seven (names and categories); only the `artwork` field distinguishes the ones with drawings, and `spiritImage()` returns `undefined` for the rest so components fall back on their own.

**Image asset policy**

- Runtime raster images in `webapp/public/` use WebP and application code must reference the `.webp` paths.
- Original PNG sources for runtime assets live outside the public web root under `webapp/source-assets/png/`, preserving their relative directory structure.
- Do not reference `webapp/source-assets/` from browser code; it is not publicly served.
- Only commit original PNGs that correspond to assets actually used by the application. Do not commit unused PNG or generated WebP variants unless requested.
- Current guardian artwork is under `webapp/public/illustrations/guardians/{bird,cat,deer}/lv1.webp` through `lv5.webp`.
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
| Payment or billing integration starts | `PUT /user/:id/subscription` is a manual-grant backdoor that exists only because there is no payment flow. Entitlement should move to provider webhooks, and this route should be removed or restricted to non-production. An admin can currently hand out paid access indefinitely. |
| Deploying to an environment that has not had `user_subscription` created | The DDL must be run by hand first — there is no migration tool. `POST /user/sync` reads the table, so a missing table breaks **sign-in for returning users**, not just the paid endpoints. |
| A new `point_transaction` type is written anywhere | Add its Chinese label to `typeLabel` in `webapp/app/user/wallet/WalletClient.tsx`. The fallback renders the raw code (`SPEND_…`) to the user, which is the symptom to look for. |
| New guardian artwork lands under `webapp/public/illustrations/guardians/` | Add the `code → species` entry to `artworkByCode` in `webapp/lib/guardianArtwork.ts`. Artwork is otherwise shipped but never displayed — this happened when the cat set landed. `/admin/species` is the quickest way to see which rows and catalog entries are still unpaired. |
| A new **field** is added to `GET /analysis/overview` | New *routes* under `/api/analysis/*` inherit the paywall from the path prefix; a new *field* does not inherit anything. Confirm the data is meant to be paid before returning it. |
| A range tab on `/analysis` or `/box` is widened | Widen the matching request parameter too (`progressDays` is derived from `DATE_RANGES`). The server trims to what was asked for, so a wider tab would silently show nothing extra. |
| `QUESTION.md` or `src/lib/questionPrompt.ts` is edited | Both must change together, and the `.ts` copy is a template literal — every backslash needs doubling again (`$\\frac` in the doc is `$\\\\frac` in source). A single backslash is a valid JSON escape, so a wrong count corrupts formulas silently rather than failing. |
| Anything touching the LV5 public-contribution promise | It is not modelled at all: no table, no endpoint, and the `/box` panel is copy only. It needs product answers first — record-only or real payment, per-spirit or per-user, and whether users see a running total. |
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
