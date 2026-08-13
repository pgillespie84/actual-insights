import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  RENDER_COOKIE_NAME,
  RENDER_MAX_AGE,
  renderToken,
  safeEqual,
  sessionToken,
} from "@/lib/authToken";

/**
 * Header the headless renderer should present its token in. Preferred over the
 * `token` query parameter, which leaks the secret into access logs, browser
 * history, and the Referer of any outbound request the rendered page makes.
 * The query parameter is still accepted because that is what renderRoute
 * currently sends; see the note there before removing it.
 */
const RENDER_TOKEN_HEADER = "x-render-token";

/**
 * The only paths the headless renderer may reach: the dashboard page, and the
 * one data route that page fetches while rendering. It previously received a
 * full session cookie on any path, so a leaked render token was equivalent to
 * the site password.
 *
 * Widen this deliberately, with a test, if a budget or analytics PDF is ever
 * added — not in advance.
 */
const RENDER_ALLOWED_PATHS = new Set(["/", "/api/dashboard"]);

function toLogin(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login", request.url));
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Public routes
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const expectedRenderCookie = renderToken();

  // The renderer's opening request, carrying the shared secret.
  const presented =
    request.headers.get(RENDER_TOKEN_HEADER) ?? searchParams.get("token");

  if (
    expectedRenderCookie &&
    presented &&
    safeEqual(presented, process.env.PDF_RENDER_AUTH_TOKEN)
  ) {
    if (!RENDER_ALLOWED_PATHS.has(pathname)) {
      return toLogin(request);
    }

    // A render-scoped cookie, not a session cookie, so the page's own fetches
    // stay authenticated for the length of the render and nothing more.
    const res = NextResponse.next();
    res.cookies.set(RENDER_COOKIE_NAME, expectedRenderCookie, {
      httpOnly: true,
      path: "/",
      maxAge: RENDER_MAX_AGE,
      sameSite: "lax",
    });
    return res;
  }

  // Follow-up fetches made by the page the renderer just loaded.
  if (
    expectedRenderCookie &&
    RENDER_ALLOWED_PATHS.has(pathname) &&
    safeEqual(request.cookies.get(RENDER_COOKIE_NAME)?.value, expectedRenderCookie)
  ) {
    return NextResponse.next();
  }

  if (safeEqual(request.cookies.get(AUTH_COOKIE_NAME)?.value, sessionToken())) {
    return NextResponse.next();
  }

  return toLogin(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
