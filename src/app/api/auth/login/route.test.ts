import { test, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route.ts";
import {
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/loginRateLimit.ts";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.SITE_PASSWORD = "correct-horse";
  // Trust the header so each request gets its own bucket. That keeps the
  // per-key lockout out of the way, isolating the global ceiling.
  process.env.TRUSTED_PROXY = "1";
  resetLoginRateLimit();
});

afterEach(() => {
  process.env = { ...originalEnv };
  resetLoginRateLimit();
});

function loginRequest(password: string, ip: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

test("a correct password succeeds and sets the auth cookie", async () => {
  const res = await POST(loginRequest("correct-horse", "203.0.113.5"));

  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("auth_token=");
});

test("a wrong password is rejected", async () => {
  const res = await POST(loginRequest("nope", "203.0.113.5"));

  expect(res.status).toBe(401);
});

// Characterisation test, not a red-green one: this pins what the route really
// does today, because it was previously described — in a commit message and a
// QA report — as doing the opposite.
//
// clearLoginAttempts resets the global ceiling, but the route gates on
// checkLoginAllowed *before* it verifies the password, so during an active
// lockout the success path is never reached. A correct password is refused
// like any other. The lockout is bounded rather than permanent: while gated the
// route returns before recordLoginFailure, so the counter and window stop
// growing and the window expires on its own.
test("a correct password is still refused while the global ceiling is active", async () => {
  // 20 distinct keys, one failure each: no per-key lockout, ceiling reached.
  for (let i = 0; i < 20; i++) recordLoginFailure(`198.51.100.${i}`);

  const res = await POST(loginRequest("correct-horse", "203.0.113.99"));

  expect(res.status).toBe(429);
  expect(res.headers.get("retry-after")).toBeTruthy();
  expect(res.headers.get("set-cookie")).toBeNull();
});
