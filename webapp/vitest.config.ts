import { normalizePath } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Deliberately the smallest config that runs, and node-only.
 *
 * It exists because `lib/invest.ts` arrived with the growth-bonus rate
 * (see AGENTS.md): the arithmetic it holds used to live in
 * `packages/shared`, where `backend_new`'s suite tested it, and deleting
 * that package would otherwise have deleted the tests for the invest
 * slider's cap along with it.
 *
 * No jsdom, no React testing library, no component tests. What is covered
 * here is pure functions; adding a DOM environment is a separate decision
 * with its own dependency weight, and pretending to have made it by
 * installing jsdom now would be the wrong kind of head start.
 *
 * `include` is narrow for the same reason: this is not "the webapp has
 * tests now", it is "this module has tests". Widen it when something
 * else gets some.
 */
/**
 * The same upper-cased Windows root as `backend_new/vitest.config.ts`, and
 * for the same reason: Vite takes its root from `process.cwd()`, Windows'
 * path APIs always answer `C:/...`, and a root that disagrees with the
 * module ids makes the coverage provider discard every file it cannot
 * place under the root -- silently, as a 0%. Nothing here imports through
 * a path alias yet, so nothing is being fixed; this is so that the first
 * test that does cannot be greeted by that.
 */
const root = normalizePath(process.cwd()).replace(/^[a-z]:/, (drive) =>
  drive.toUpperCase()
)

export default defineConfig({
  root,
  // The `@/*` of tsconfig.json, which Next resolves for the app and
  // nothing resolves here. Built from the same `root` above so the two
  // spellings cannot diverge -- see that comment for what diverging
  // costs.
  resolve: {
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scoped to lib/, not to the whole webapp, and the number this
      // prints is therefore "how much of lib/ is tested" -- not "how
      // much of the webapp is tested". Pointed at `app/` and
      // `components/` it would read near zero and stay there, because
      // those are React components and there is no DOM environment here
      // on purpose (see above); a figure that cannot move is not a
      // measurement. lib/ is the part where coverage can actually be
      // earned, so lib/ is what it reports -- and it reports every file
      // in there, including the untested ones, so the denominator is
      // honest.
      // `invest.ts` reads 86.66% and no test can lift it: the two
      // correction loops in `pointsForXp` never execute, because the
      // closed form above them is exact for every integer rate 0-200
      // and every target up to 20,000 (brute-forced). They are
      // defensive code, not untested code -- don't chase the number.
      include: ['lib/**/*.ts'],
    },
  },
})
