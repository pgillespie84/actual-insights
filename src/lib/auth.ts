import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_NAME,
  RENDER_COOKIE_NAME,
  SESSION_MAX_AGE,
  renderToken,
  safeEqual,
  sessionToken,
} from "./authToken";

/**
 * A real logged-in session. This is the strict check — it never accepts the
 * headless renderer's cookie. Use it for anything that acts on the account.
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return safeEqual(cookieStore.get(AUTH_COOKIE_NAME)?.value, sessionToken());
}

/**
 * A logged-in session, or the headless renderer.
 *
 * The renderer has to read the dashboard's data routes to produce the monthly
 * PDF, so those routes accept its cookie. Everything that sends mail or
 * triggers a render uses isAuthenticated() instead, which means a leaked
 * PDF_RENDER_AUTH_TOKEN cannot be used to send email or start renders.
 */
export async function hasReadAccess(): Promise<boolean> {
  if (await isAuthenticated()) return true;

  const expected = renderToken();
  if (!expected) return false;

  const cookieStore = await cookies();
  return safeEqual(cookieStore.get(RENDER_COOKIE_NAME)?.value, expected);
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}

export function isValidRenderToken(token: string): boolean {
  return safeEqual(token, process.env.PDF_RENDER_AUTH_TOKEN);
}

export function verifyPassword(password: string): boolean {
  return safeEqual(password, process.env.SITE_PASSWORD);
}

export function getAuthCookie(): {
  name: string;
  value: string;
  maxAge: number;
  httpOnly: boolean;
  path: string;
} {
  const value = sessionToken();
  if (!value) throw new Error("SITE_PASSWORD env var is not set");

  return {
    name: AUTH_COOKIE_NAME,
    value,
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    path: "/",
  };
}
