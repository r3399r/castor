import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      exclude: ['src/lambda/api.ts', 'src/lambda/facebook.ts'],
    },
  },
});
