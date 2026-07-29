import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { userTable } from 'src/db/schema';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

// The admin gate is exercised end-to-end in its own describe block below;
// every other test just needs reads to succeed, so default the mocked
// Firebase verification to the admin identity. verifyIdTokenFull backs
// POST /sync's own (non-admin) identity check.
vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenFull: vi.fn() }));
import { verifyIdToken, verifyIdTokenFull } from 'src/lib/firebaseAdmin';

type UserDto = {
  id: number;
  firebaseUid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  lastLoginAt: string | null;
};

const clearTable = async () => {
  await getDb().delete(userTable);
};

describe('user routes', () => {
  beforeAll(clearTable);

  beforeEach(() => {
    vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);
  });

  afterEach(clearTable);

  afterAll(async () => {
    await closeDb();
  });

  it('lists users, empty when there is no data', async () => {
    const res = await app.request('/api/user');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [],
      paginate: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('lists a seeded user with all its columns', async () => {
    await getDb().insert(userTable).values({
      firebaseUid: 'uid-1',
      email: 'a@example.com',
      name: 'Alice',
      avatar: 'https://example.com/a.png',
      lastLoginAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.request('/api/user');
    const body = (await res.json()) as { data: UserDto[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      firebaseUid: 'uid-1',
      email: 'a@example.com',
      name: 'Alice',
      avatar: 'https://example.com/a.png',
    });
  });

  it('fetches a user by id', async () => {
    const [{ insertId }] = await getDb()
      .insert(userTable)
      .values({ firebaseUid: 'uid-2', email: 'b@example.com', name: 'Bob' });

    const res = await app.request(`/api/user/${insertId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'b@example.com', name: 'Bob' });
  });

  it('404s for an unknown user id', async () => {
    const res = await app.request('/api/user/999999');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      status: 404,
      name: 'NotFoundError',
      code: 'NOT_FOUND',
    });
  });

  describe('pagination and sorting', () => {
    it('paginates with limit/offset and reports page metadata', async () => {
      await getDb()
        .insert(userTable)
        .values([
          { firebaseUid: 'uid-c', name: 'c-charlie' },
          { firebaseUid: 'uid-a', name: 'a-alpha' },
          { firebaseUid: 'uid-b', name: 'b-bravo' },
        ]);

      const res = await app.request('/api/user?limit=2&offset=0');
      const body = (await res.json()) as {
        data: UserDto[];
        paginate: { total: number; page: number; limit: number; totalPages: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.paginate).toEqual({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });

      const page2 = await app.request('/api/user?limit=2&offset=2');
      const page2Body = (await page2.json()) as { data: UserDto[] };
      expect(page2Body.data).toHaveLength(1);
    });

    it('sorts by name ascending and descending', async () => {
      await getDb()
        .insert(userTable)
        .values([
          { firebaseUid: 'uid-c', name: 'c-charlie' },
          { firebaseUid: 'uid-a', name: 'a-alpha' },
          { firebaseUid: 'uid-b', name: 'b-bravo' },
        ]);

      const ascRes = await app.request('/api/user?sort=name&order=asc');
      const ascBody = (await ascRes.json()) as { data: UserDto[] };
      expect(ascBody.data.map((u) => u.name)).toEqual([
        'a-alpha',
        'b-bravo',
        'c-charlie',
      ]);

      const descRes = await app.request('/api/user?sort=name&order=desc');
      const descBody = (await descRes.json()) as { data: UserDto[] };
      expect(descBody.data.map((u) => u.name)).toEqual([
        'c-charlie',
        'b-bravo',
        'a-alpha',
      ]);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const res = await app.request('/api/user?limit=99999');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid sort column with 400', async () => {
      const res = await app.request('/api/user?sort=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /sync', () => {
    const postSync = () => app.request('/api/user/sync', { method: 'POST' });

    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue(null);
      const res = await postSync();
      expect(res.status).toBe(401);
    });

    it('creates a new user row on first sign-in', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'new-uid',
        email: 'new@example.com',
        name: 'New User',
        picture: 'https://example.com/new.png',
      });

      const res = await postSync();
      expect(res.status).toBe(201);
      const body = (await res.json()) as UserDto;
      expect(body).toMatchObject({
        firebaseUid: 'new-uid',
        email: 'new@example.com',
        name: 'New User',
        avatar: 'https://example.com/new.png',
      });
      expect(body.lastLoginAt).toEqual(expect.any(String));

      const rows = await getDb().select().from(userTable).where(eq(userTable.firebaseUid, 'new-uid'));
      expect(rows).toHaveLength(1);
    });

    it('succeeds for a non-admin identity -- /sync is not gated by the admin allowlist', async () => {
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'ordinary-uid',
        email: 'ordinary@example.com',
        name: 'Ordinary User',
        picture: null,
      });

      const res = await postSync();
      expect(res.status).toBe(201);
    });

    it('refreshes only lastLoginAt for a returning user, leaving other fields untouched', async () => {
      const [{ insertId }] = await getDb().insert(userTable).values({
        firebaseUid: 'returning-uid',
        email: 'original@example.com',
        name: 'Original Name',
        avatar: 'https://example.com/original.png',
        lastLoginAt: new Date('2020-01-01T00:00:00Z'),
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });
      // Firebase-side profile changed since the row was created -- sync
      // should not overwrite the stored name/email/avatar with these.
      vi.mocked(verifyIdTokenFull).mockResolvedValue({
        uid: 'returning-uid',
        email: 'changed@example.com',
        name: 'Changed Name',
        picture: 'https://example.com/changed.png',
      });

      const res = await postSync();
      expect(res.status).toBe(200);
      const body = (await res.json()) as UserDto;
      expect(body).toMatchObject({
        id: insertId,
        email: 'original@example.com',
        name: 'Original Name',
        avatar: 'https://example.com/original.png',
      });
      expect(new Date(body.lastLoginAt!).getTime()).toBeGreaterThan(new Date('2020-01-01T00:00:00Z').getTime());

      const rows = await getDb().select().from(userTable).where(eq(userTable.firebaseUid, 'returning-uid'));
      expect(rows).toHaveLength(1);
    });
  });

  describe('admin auth gate', () => {
    it('rejects a GET with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await app.request('/api/user');
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        status: 401,
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects a GET with 403 for a non-admin email', async () => {
      vi.mocked(verifyIdToken).mockResolvedValue('someone-else@example.com');

      const res = await app.request('/api/user');
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        status: 403,
        name: 'ForbiddenError',
        code: 'FORBIDDEN',
      });
    });
  });
});
