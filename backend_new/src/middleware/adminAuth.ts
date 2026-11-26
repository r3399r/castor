import { createMiddleware } from 'hono/factory';
import { verifyIdToken } from 'src/lib/firebaseAdmin';
import { ForbiddenError, UnauthorizedError } from 'src/model/error';

// Hard-coded on purpose -- there's no admin/role concept in the data model
// yet, and adding one for a single-person allowlist would be premature.
// Add more addresses here as needed.
export const ADMIN_EMAILS = ['lamplighter.planet@gmail.com', 'kaxisch@gmail.com'];

// The *safe* methods, deliberately, rather than a list of writes. Spelled
// as ['POST', 'PUT', 'DELETE'] until 2026-11-27, which meant any method
// not on that list passed unauthenticated -- and the /api/* CloudFront
// behavior allows PATCH, so the first PATCH route anyone writes would have
// been an unauthenticated write reachable from the edge, with nothing
// failing to say so. A gate that defaults to closed cannot be opened by
// forgetting to edit it.
//
// OPTIONS is here because a preflight carries no Authorization header by
// definition; answering it 401 would break the request that follows
// rather than protect anything. Nothing in this app mutates on
// GET/HEAD/OPTIONS.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Frontend sends the raw Firebase ID token as the Authorization header
// value (no "Bearer " prefix), matching the legacy backend's convention.
const verifyAdmin = async (token: string | undefined) => {
  const email = await verifyIdToken(token);
  if (email === null) throw new UnauthorizedError('Sign-in required');
  if (!ADMIN_EMAILS.includes(email))
    throw new ForbiddenError('Admin access required');
};

/**
 * Gates every mutating request to a hard-coded admin allowlist;
 * GET/HEAD/OPTIONS pass through untouched. Suitable for resources whose
 * GET output is otherwise-public content (categories, subjects, etc.) --
 * use requireAdmin instead for anything that reads as PII.
 *
 * "Mutating" means "not safe", not a list of verbs: see SAFE_METHODS.
 *
 * Note what this does *not* do: on a resource that only has reads, it is
 * no gate at all. `/api/species` and `/api/donation-batch` use
 * requireAdmin for exactly that reason, and `/api/question/image/prompt`
 * needs a requireAdmin of its own on top of this one.
 */
export const adminAuth = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();

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
