import admin from 'firebase-admin';

/**
 * Lazy, guarded init -- initializing eagerly at module load would run
 * during every test import (this module is pulled in by the admin auth
 * middleware, which app.ts always wires up) and blow up in local/test
 * environments where FIREBASE_ADMIN_KEY isn't set.
 */
const getAuth = () => {
  if (admin.apps.length === 0)
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_ADMIN_KEY ?? '{}')
      ),
    });

  return admin.auth();
};

/**
 * Returns the verified token's email, or null if the token is missing,
 * expired, or otherwise fails verification -- callers decide what that
 * means (401 vs 403), this just answers "who, if anyone".
 */
export const verifyIdToken = async (
  token: string | undefined
): Promise<string | null> => {
  if (!token) return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.email ?? null;
  } catch (error) {
    console.error('Invalid Firebase token', error);
    return null;
  }
};
