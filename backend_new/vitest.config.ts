import { normalizePath } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Vite's root, with the Windows drive letter forced to upper case.
 *
 * This looks like fussing over nothing and is not. Vite takes its root
 * from `process.cwd()`, which keeps whatever case the shell handed it --
 * `c:/...` from a POSIX shell, `C:/...` from PowerShell. Windows' own
 * path APIs always answer `C:/...`, so that is the case every module
 * resolved through node_modules arrives with.
 *
 * Mix the two and nothing fails: both spellings open the same file, so
 * all 1,028 tests pass either way. What silently breaks is coverage. The
 * v8 provider keeps only the results whose URL sits under the root, and
 * with a lower-case root every `src/**` module was thrown away: the
 * report said 0% of 3,228 statements while the whole regression suite
 * was passing -- it read like "nothing is tested" when the truth was
 * "nothing was measured". The figure it did sometimes print, 13.53%, was
 * a partial count from whichever modules happened to come back the other
 * way, which is worse than the zero.
 *
 * Normalising here rather than at the call sites keeps the project to
 * one spelling, so the coverage filter, the module ids and vitest's mock
 * registry all agree -- the mock registry is the reason this is not done
 * by patching the path resolution instead: `vi.mock('@aws-sdk/client-s3')`
 * is keyed by resolved id, and a module reached under two spellings
 * registers its mock under one and looks it up under the other.
 */
const root = normalizePath(process.cwd()).replace(/^[a-z]:/, (drive) =>
  drive.toUpperCase()
);

export default defineConfig({
  root,
  // vite-tsconfig-paths defaults to tsconfig.json, whose `include` is
  // scoped to src/ only (kept minimal on purpose -- it's what esbuild
  // reads for the real Lambda build). Point it at tsconfig.tools.json
  // instead, which also covers regression/**, so path aliases resolve there too.
  plugins: [tsconfigPaths({ projects: ['./tsconfig.tools.json'] })],
  test: {
    environment: 'node',
    setupFiles: ['./regression/setup.ts'],
    // Tests share one MySQL connection pool and truncate tables between
    // cases -- running files in parallel would race on that shared state.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // Thin wiring files: a real handler/DB round trip, not branching
      // logic. Coverage on them mostly measures "did esbuild include this
      // line", not "did we test the behavior" -- excluded for signal, not
      // to hide untested code.
      exclude: ['src/lambda/api.ts', 'src/lambda/facebook.ts', 'src/lambda/housekeep.ts'],
    },
  },
});
