import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toErrorResponse } from 'src/lib/errorResponse';
import { ADMIN_EMAILS, adminAuth, requireAdmin } from 'src/middleware/adminAuth';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn() }));
import { verifyIdToken } from 'src/lib/firebaseAdmin';

/**
 * The gate itself, away from any one resource.
 *
 * Every route group behind `adminAuth` has its own 401/403 test, but they
 * all exercise the verbs that group happens to expose -- so none of them
 * says what happens to a method nobody has written a route for yet. That
 * is the property this file pins: the gate is closed by default, and a
 * `PATCH` added next year is covered without anyone editing the
 * middleware.
 *
 * The app is built here rather than imported from src/app.ts: this is a
 * unit test for the middleware, it touches no database, and mounting it
 * on two bare routes makes the method the only variable.
 */
const buildApp = (gate: typeof adminAuth) =>
  new Hono()
    .use('/thing/*', gate)
    .all('/thing/:id', (c) => c.json({ ok: true }))
    .onError((err, c) => {
      const { status, body } = toErrorResponse(err);

      return c.json(body, status);
    });

const asAdmin = () => vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
const asUser = () => vi.mocked(verifyIdToken).mockResolvedValue('someone@example.com');
const asNobody = () => vi.mocked(verifyIdToken).mockResolvedValue(null);

const call = (app: Hono, method: string, token?: string) =>
  app.request(`/thing/1`, {
    method,
    headers: token === undefined ? undefined : { Authorization: token },
  });

describe('adminAuth', () => {
  beforeEach(() => {
    vi.mocked(verifyIdToken).mockReset();
  });

  // The posture the catalog groups are mounted with: a subject's name is
  // public content, so reads answer with no credentials at all.
  describe('the safe methods', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('lets %s through with no identity', async (method) => {
      asNobody();
      const res = await call(buildApp(adminAuth), method);

      expect(res.status).toBe(200);
      // Not merely allowed: never even asked. A read on these groups must
      // not depend on the token verifier being reachable.
      expect(verifyIdToken).not.toHaveBeenCalled();
    });
  });

  describe('the mutating methods', () => {
    it.each(['POST', 'PUT', 'DELETE'])('rejects %s with no identity', async (method) => {
      asNobody();
      const res = await call(buildApp(adminAuth), method, 'token');

      expect(res.status).toBe(401);
    });

    it.each(['POST', 'PUT', 'DELETE'])('rejects %s from a non-admin', async (method) => {
      asUser();
      const res = await call(buildApp(adminAuth), method, 'token');

      expect(res.status).toBe(403);
    });

    it.each(['POST', 'PUT', 'DELETE'])('admits %s from an admin', async (method) => {
      asAdmin();
      const res = await call(buildApp(adminAuth), method, 'token');

      expect(res.status).toBe(200);
    });
  });

  /**
   * The reason this file exists.
   *
   * The check listed the three write verbs until 2026-11-27 and let
   * everything else past, so a PATCH route would have been an
   * unauthenticated write -- and CloudFront's /api/* behavior allows
   * PATCH, so it would have been reachable from the edge. There is no
   * PATCH route in this app today; this test is what keeps the gate shut
   * for the one that gets written without anyone rereading the
   * middleware.
   */
  describe('a method no route uses yet', () => {
    it('rejects PATCH with no identity', async () => {
      asNobody();
      const res = await call(buildApp(adminAuth), 'PATCH', 'token');

      expect(res.status).toBe(401);
    });

    it('rejects PATCH from a non-admin', async () => {
      asUser();
      const res = await call(buildApp(adminAuth), 'PATCH', 'token');

      expect(res.status).toBe(403);
    });

    it('admits PATCH from an admin', async () => {
      asAdmin();
      const res = await call(buildApp(adminAuth), 'PATCH', 'token');

      expect(res.status).toBe(200);
    });
  });

  // The other half of the pair, stated here so the difference between the
  // two is written down once in a test rather than only in prose: this one
  // gates reads as well, which is why /api/species and /api/donation-batch
  // use it.
  describe('requireAdmin, beside it', () => {
    it('rejects a GET with no identity', async () => {
      asNobody();
      const res = await call(buildApp(requireAdmin), 'GET', 'token');

      expect(res.status).toBe(401);
    });

    it('rejects a GET from a non-admin', async () => {
      asUser();
      const res = await call(buildApp(requireAdmin), 'GET', 'token');

      expect(res.status).toBe(403);
    });

    it('admits a GET from an admin', async () => {
      asAdmin();
      const res = await call(buildApp(requireAdmin), 'GET', 'token');

      expect(res.status).toBe(200);
    });
  });
});
