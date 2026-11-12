/**
 * First, and for a side effect: without it every `.describe()` in every
 * schema is silently dropped from the output. The schemas keep the text
 * either way, so nothing fails -- the document just comes out with no
 * field documentation at all, which is how it was generated the first
 * time until the output was actually read.
 */
import 'zod-openapi/extend';

import { writeFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { app } from 'src/app';

/**
 * Writes the OpenAPI document for this API to openapi.json.
 *
 * Generated from the route definitions rather than hand-written, and
 * written to a file rather than served: a document of every endpoint,
 * including the admin ones, is a map of the attack surface, and nothing
 * needs it at runtime. Clients are generated from the committed file.
 *
 * Only routes carrying a `describeRoute` appear at all -- an undocumented
 * route is absent from the document, not listed without a schema. That is
 * what makes this safe to adopt one route group at a time, and it also
 * means the path count below is the migration's progress bar, not a count
 * of what this API serves.
 *
 * Run with `npm run openapi`. It touches no database -- getDb() is lazy,
 * so importing the app composes the routes without connecting.
 */
const OUT = 'openapi.json';

const spec = new Hono().get(
  '/openapi.json',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'castor API',
        version: '1.0.0',
        description:
          'The API behind the 學益 webapp. Generated from the backend_new route definitions by tools/openapi.ts -- do not edit by hand.',
      },
      servers: [{ url: 'https://api.learnforgood.org', description: 'production' }],
    },
  }),
);

const main = async (): Promise<void> => {
  const res = await spec.request('/openapi.json');
  if (!res.ok) throw new Error(`generation failed: ${res.status} ${await res.text()}`);
  const document: unknown = await res.json();
  // Pretty-printed with a trailing newline so the committed file diffs
  // line by line and a CI check can compare it byte for byte.
  await writeFile(OUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const paths = Object.keys((document as { paths?: Record<string, unknown> }).paths ?? {});
  console.log(`wrote ${OUT}: ${paths.length} paths`);
};

void main();
