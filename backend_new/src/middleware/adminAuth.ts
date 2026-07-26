import { createMiddleware } from 'hono/factory';
import { verifyIdToken } from 'src/lib/firebaseAdmin';
import { ForbiddenError, UnauthorizedError } from 'src/model/error';

// Hard-coded on purpose -- there's no admin/role concept in the data model
// yet, and adding one for a single-person allowlist would be premature.
// Add more addresses here as needed.
export const ADMIN_EMAILS = ['lamplighter.planet@gmail.com'];

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE']);

// Frontend sends the raw Firebase ID token as the Authorization header
// value (no "Bearer " prefix), matching the legacy backend's convention.
const verifyAdmin = async (token: string | undefined) => {
  const email = await verifyIdToken(token);
  if (email === null) throw new UnauthorizedError('Sign-in required');
  if (!ADMIN_EMAILS.includes(email))
    throw new ForbiddenError('Admin access required');
};

/**
 * Gates mutating requests (POST/PUT/DELETE) to a hard-coded admin
 * allowlist; GET traffic passes through untouched. Suitable for resources
 * whose GET output is otherwise-public content (categories, subjects,
 * etc.) -- use requireAdmin instead for anything that reads as PII.
 */
export const adminAuth = createMiddleware(async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  await verifyAdmin(c.req.header('Authorization'));
  await next();
});

/**
 * Gates every method, including GET -- for resources like user records
 * where even read access exposes PII (email, name) that non-admins
 * shouldn't be able to list.
 */
export const requireAdmin = createMiddleware(async (c, next) => {
  await verifyAdmin(c.req.header('Authorization'));
  await next();
});
