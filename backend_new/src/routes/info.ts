import { Hono } from 'hono';

export const info = new Hono().get('/', (c) =>
  c.json({ status: 'ok', time: new Date().toISOString() })
);
