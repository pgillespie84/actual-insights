import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, getAuthCookie } from "@/lib/auth";
import {
  checkLoginAllowed,
  clearLoginAttempts,
  recordLoginFailure,
} from "@/lib/loginRateLimit";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);

  const gate = checkLoginAllowed(key);
  if (!gate.allowed) {
    console.warn(
      `[auth] login blocked for ${key} — locked for another ${gate.retryAfterSeconds}s`,
    );
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof password !== "string" || !verifyPassword(password)) {
    const { failures, lockedUntil } = recordLoginFailure(key);
    console.warn(
      `[auth] failed login from ${key} (attempt ${failures})` +
        (lockedUntil ? ` — locked until ${new Date(lockedUntil).toISOString()}` : ""),
    );
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  clearLoginAttempts(key);

  const response = NextResponse.json({ success: true });
  const cookie = getAuthCookie();
  response.cookies.set(cookie.name, cookie.value, {
    maxAge: cookie.maxAge,
    httpOnly: cookie.httpOnly,
    path: cookie.path,
  });

  return response;
}
