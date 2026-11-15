// First, and for its side effects: it loads `.env.local` and applies the
// local defaults, so this server starts against the docker-compose
// database on a machine that has no `.env.local` at all. ECPay routes
// still need real values -- they answer ECPAY_NOT_CONFIGURED without.
import './localEnv';

import { serve } from '@hono/node-server';
import { app } from 'src/app';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`castor backend_new listening on http://localhost:${info.port}`);
});
