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
