import { createMiddleware } from 'hono/factory';
import { verifyIdToken } from 'src/lib/firebaseAdmin';
import { ForbiddenError, UnauthorizedError } from 'src/model/error';

// Hard-coded on purpose -- there's no admin/role concept in the data model
// yet, and adding one for a single-person allowlist would be premature.
// Add more addresses here as needed.
export const ADMIN_EMAILS = ['lamplighter.planet@gmail.com'];

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE']);

/**
 * Gates mutating requests (POST/PUT/DELETE) to a hard-coded admin
 * allowlist; GET traffic passes through untouched. Frontend sends the
 * raw Firebase ID token as the Authorization header value (no "Bearer "
 * prefix), matching the legacy backend's convention.
 */
export const adminAuth = createMiddleware(async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  const email = await verifyIdToken(c.req.header('Authorization'));
  if (email === null) throw new UnauthorizedError('Sign-in required');
  if (!ADMIN_EMAILS.includes(email))
    throw new ForbiddenError('Admin access required');

  await next();
});
