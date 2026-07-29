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
 * Verifies the raw Firebase ID token (no "Bearer " prefix, matching the
 * frontend's convention) and returns the decoded token, or null if it's
 * missing, expired, or otherwise fails verification. The three exports
 * below each just project the field(s) their caller needs off of this.
 */
const verifyFirebaseToken = async (token: string | undefined) => {
  if (!token) return null;

  try {
    return await getAuth().verifyIdToken(token);
  } catch (error) {
    console.error('Invalid Firebase token', error);
    return null;
  }
};

/**
 * Returns the verified token's email, or null -- callers decide what
 * that means (401 vs 403), this just answers "who, if anyone".
 */
export const verifyIdToken = async (token: string | undefined): Promise<string | null> => {
  const decoded = await verifyFirebaseToken(token);
  return decoded?.email ?? null;
};

/**
 * Returns the verified token's Firebase uid, or null -- for resolving
 * *which* app user (by firebase_uid) is asking, as opposed to
 * verifyIdToken's admin-allowlist email check.
 */
export const verifyIdTokenUid = async (token: string | undefined): Promise<string | null> => {
  const decoded = await verifyFirebaseToken(token);
  return decoded?.uid ?? null;
};

export type VerifiedIdentity = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * Returns everything the user-sync endpoint needs to create or refresh a
 * user row (uid plus the profile fields Firebase carries on the token),
 * or null if verification fails.
 */
export const verifyIdTokenFull = async (
  token: string | undefined
): Promise<VerifiedIdentity | null> => {
  const decoded = await verifyFirebaseToken(token);
  if (!decoded) return null;

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
  };
};
