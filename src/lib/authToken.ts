/**
 * Token derivation and constant-time comparison, shared by the proxy and the
 * server-side auth helpers.
 *
 * This lives apart from auth.ts because auth.ts imports next/headers and
 * next/navigation, neither of which can be used from proxy.ts. Keeping the
 * crypto here means there is one derivation instead of the three copies that
 * used to be spread across auth.ts and proxy.ts.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "auth_token";
export const RENDER_COOKIE_NAME = "render_token";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const RENDER_MAX_AGE = 60; // seconds — only needs to outlive one render

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison. Both sides are hashed first, so the buffers are
 * always 32 bytes — timingSafeEqual requires equal lengths, and hashing also
 * stops the comparison leaking the expected value's length.
 */
export function safeEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Value stored in the session cookie: a one-way digest of the password, so a
 * leaked cookie no longer discloses SITE_PASSWORD by itself.
 *
 * This is a fast hash, not a password KDF. It stops the cookie being decoded
 * back to the password, but an attacker holding a leaked cookie can still
 * brute-force a weak SITE_PASSWORD offline. Use a long random password.
 *
 * Returns null when SITE_PASSWORD is unset so comparisons fail closed rather
 * than authenticating against a token derived from "undefined".
 */
export function sessionToken(): string | null {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;
  return sha256(`actual-dashboard:session:${password}`).toString("hex");
}

/**
 * Value stored in the render cookie. Derived from a different secret and a
 * different prefix than the session token, so the two are not interchangeable:
 * a render cookie grants read-only access to the dashboard and its data
 * routes, never the whole site.
 */
export function renderToken(): string | null {
  const secret = process.env.PDF_RENDER_AUTH_TOKEN;
  if (!secret) return null;
  return sha256(`actual-dashboard:render:${secret}`).toString("hex");
}
