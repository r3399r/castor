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

### Database

- Schema changes must be made in `db/table/*.sql`, and the matching Drizzle definitions in `backend_new/src/db/schema.ts` must be updated in the same change — the two are hand-kept in sync and regression tests seed from `db/table/`.
- Do not modify production database structure directly.
- Data backfills/seeds belong in `db/script/<version>/`, not in application code.
- `backend/` (legacy) entities in `src/model/entity/` are not the source of truth; do not add tables there.

### Backend

- Do new backend work in `backend_new/`. Treat `backend/` as legacy — change it only when the task explicitly targets it.
- API contracts must stay backward compatible unless the task explicitly requires a breaking change; `webapp/` and `mobile/` both consume them.
- Validate request input with zod in the route file, and throw `HttpError` subclasses from `src/model/error/` rather than returning ad-hoc error responses.
- Do not bypass the middleware chain in `src/app.ts` (`adminAuth` / `requireAdmin` / `transaction` / `requireUser`). New routes go behind the same chain as comparable existing routes.
- Do not open your own DB connection — use the `db` from the request context (`c.get('db')`) so work stays inside the request transaction.
- Adding a new Lambda entrypoint means updating `package.json` build scripts *and* `aws/cloudformation/template.yaml`.
- `POST /question/image` transcribes a screenshot of one question via Gemini (up to 3 crops of the same question per request). Its prompt is `QUESTION.md` at the repo root, mirrored verbatim into `backend_new/src/lib/questionPrompt.ts` because the bundled Lambda has no repo files at runtime — edit both together. Running it locally needs `GOOGLE_GENAI_API_KEY` in `backend_new/.env.local`; the regression suite mocks `src/lib/genai` so it does not.
- Run `npm run typecheck` and `npm run test:unit` before declaring backend work done; run `npm test` when touching routes or DB access.

### Frontend

- Use existing components and patterns in `webapp/components/` before creating new ones.
- Keep the App Router split: `page.tsx` stays a server component, interactive logic goes in the sibling `*Client.tsx`.
- Call the API through `webapp/lib/api.ts`; do not hand-roll `fetch` calls or re-implement auth-header handling.
- Keep response types in `webapp/types/api.ts` (or `packages/shared`) in step with backend changes.
- The webapp is exported as a static site and synced to S3 — do not add server-only Next.js features (route handlers, SSR-only APIs, middleware) without flagging it.

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

- The standard header uses a solid deep-teal background, the low-contrast `header-pencil-hatching-02.webp` texture, a warm-cream logo, gold active state, gold avatar border, and pathname-based navigation state.
- Standard header content aligns to the same `1120px` maximum-width container used by page content, with responsive horizontal insets of 16px, 40px, and 70px.
- Header heights are approximately 80px desktop, 70px tablet, and 62px mobile.
- The mobile menu icon remains 32px square; do not let general button padding shrink its SVG.
- `/box` is the exception: its header is transparent and absolutely positioned over the hero, but its height and logo/menu alignment must remain consistent with the standard header.
- Preserve keyboard `focus-visible` styling separately from the active navigation underline.

**Gift box page (`/box`)**

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
- The landscape element currently points to `/images/learning-history-header-landscape-05.webp` but is intentionally hidden with `opacity: 0` pending further art-direction work. Do not re-enable or replace it without an explicit request.
- The three summary cards retain real values and calculations. They use 180px desktop, 170px tablet, and 155px mobile heights; mobile stacks them in one column.
- Summary card values and units stay on one baseline. Cards retain subtle borders, 12px radii, and no shadows.
- Large chart/data cards retain their own 16px radii and subtle borders. Do not change chart types, content order, filters, or data behavior during visual-only work.

**Spirit categories**

| Public-interest category | Spirit | Artwork status | Store egg name |
| --- | --- | --- | --- |
| 兒少、家庭與婦幼 | 貓 | Pending | 暖陽之蛋 |
| 身心障礙與神經發展 | 水獺 | Pending | 星光之蛋 |
| 高齡長照與失智照護 | 狗 | Pending | 長青之蛋 |
| 疾病醫療、心理與善終 | 兔子 | Pending | 療癒之蛋 |
| 人權、法治、性別與社區 | 海豚 | Pending | 共鳴之蛋 |
| 教育翻轉、人文與藝術 | 鳥 | LV1-LV5 available | 智慧之蛋 |
| 生態環境與動物福利 | 鹿 | LV1-LV5 available | 森林之蛋 |

Until the other five artwork sets exist, their store and locked collection states use the shared egg asset rather than substitute character artwork. Keep spirit artwork data-driven; do not hard-code the UI to deer or bird.

**Image asset policy**

- Runtime raster images in `webapp/public/` use WebP and application code must reference the `.webp` paths.
- Original PNG sources for runtime assets live outside the public web root under `webapp/source-assets/png/`, preserving their relative directory structure.
- Do not reference `webapp/source-assets/` from browser code; it is not publicly served.
- Only commit original PNGs that correspond to assets actually used by the application. Do not commit unused PNG or generated WebP variants unless requested.
- Current guardian artwork is under `webapp/public/illustrations/guardians/{bird,deer}/lv1.webp` through `lv5.webp`.
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
