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
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
