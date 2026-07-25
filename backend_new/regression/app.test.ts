import { describe, expect, it } from 'vitest';
import { app } from 'src/app';

describe('app', () => {
  it('GET /api/info reports ok with no database involved', async () => {
    const res = await app.request('/api/info');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; time: string };
    expect(body.status).toBe('ok');
    expect(new Date(body.time).toString()).not.toBe('Invalid Date');
  });

  it('404s on an unregistered route', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});
