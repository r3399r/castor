/**
 * The webapp's view of the API contract.
 *
 * A type barrel: this is where every screen imports the request and
 * response shapes from. @castor/shared also carries a little runtime code
 * -- the subscriber growth bonus, which the box page has to compute to
 * show the user the sum before they confirm -- and `export *` does
 * re-export those values, but import them from '@castor/shared' directly
 * so a value import is never mistaken for a type-only one.
 */
export * from '@castor/shared'
