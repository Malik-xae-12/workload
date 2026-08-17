/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mirrors backend/backend/app/core/friendly_errors.py's approach, for the
 * cases the backend can't clean up itself — a request that fails before it
 * ever reaches the backend (network down, DNS failure, CORS, timeout) only
 * ever produces a raw browser/fetch error string, never passes through the
 * backend's own friendly-message rewriting.
 *
 * The backend already rewrites its OWN error `detail` values before they
 * reach the frontend (see friendly_errors.py) — this is deliberately NOT a
 * second pass over `body.detail`; re-filtering an already-cleaned message
 * risks mangling it. This only runs on genuine client-side/network
 * failures caught in fabricApi.ts's request() function.
 */
export function toFriendlyClientError(rawMessage: string): string {
  const msg = rawMessage || '';

  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return "We couldn't reach the server. Please check your internet connection and try again.";
  }
  if (/timeout|timed out/i.test(msg)) {
    return 'That took longer than expected. Please try again.';
  }
  if (/cors/i.test(msg)) {
    return 'Something went wrong on our end. Please try again — if this keeps happening, contact support.';
  }
  if (/unexpected token|json/i.test(msg) && /</.test(msg)) {
    // Fetch tried to parse an HTML error page as JSON — a generic backend
    // outage, not something to describe technically to the person.
    return 'Something went wrong on our end. Please try again — if this keeps happening, contact support.';
  }

  return msg || 'Something went wrong. Please try again.';
}