import { config } from 'dotenv';
config({ path: '.env.local' });

import { serve } from '@hono/node-server';
import { app } from 'src/app';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`castor backend_new listening on http://localhost:${info.port}`);
});
