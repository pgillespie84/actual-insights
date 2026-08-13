import { test, beforeEach, expect } from "vitest";
import { NextRequest } from "next/server";

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.SITE_PASSWORD = "test-password";
  process.env.PDF_RENDER_AUTH_TOKEN = "render-secret-123";
});

function buildRequest(
  path: string,
  opts?: { cookies?: Record<string, string>; headers?: Record<string, string> },
): NextRequest {
  const req = new NextRequest(`http://localhost:3000${path}`, {
    headers: opts?.headers,
  });
  for (const [name, value] of Object.entries(opts?.cookies ?? {})) {
    req.cookies.set(name, value);
  }
  return req;
}

async function tokens() {
  const { sessionToken, renderToken } = await import("./lib/authToken.ts");
  return { session: sessionToken()!, render: renderToken()! };
}

function redirectedToLogin(res: Response): boolean {
  return /\/login$/.test(res.headers.get("location") ?? "");
}

test("render token on the dashboard route sets a render cookie, not a session cookie", async () => {
  const { proxy } = await import("./proxy.ts");
  const { render, session } = await tokens();

  const res = proxy(buildRequest("/?month=2026-04&print=1&token=render-secret-123"));

  expect(res.headers.get("location")).toBeNull();
  const setCookie = res.headers.get("set-cookie")!;
  expect(setCookie).toContain("render_token=");
  expect(setCookie).toContain(render);
  expect(setCookie).not.toContain("auth_token=");
  expect(setCookie).not.toContain(session);
});

test("render token is accepted from the x-render-token header", async () => {
  const { proxy } = await import("./proxy.ts");

  const res = proxy(
    buildRequest("/", { headers: { "x-render-token": "render-secret-123" } }),
  );

  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("set-cookie")).toContain("render_token=");
});

// #60: the token used to mint a full session cookie on any path, so knowing it
// was equivalent to knowing the site password.
test("render token does not unlock pages outside the render allowlist", async () => {
  const { proxy } = await import("./proxy.ts");

  for (const path of ["/budget", "/analytics", "/trends"]) {
    const res = proxy(buildRequest(`${path}?token=render-secret-123`));
    expect(redirectedToLogin(res), `${path} should be denied`).toBe(true);
  }
});

test("render token does not unlock routes that act on the account", async () => {
  const { proxy } = await import("./proxy.ts");

  for (const path of ["/api/email/send", "/api/render/smoke"]) {
    const res = proxy(buildRequest(`${path}?token=render-secret-123`));
    expect(redirectedToLogin(res), `${path} should be denied`).toBe(true);
  }
});

// Least privilege: only / and /api/dashboard are ever rendered, so the render
// token has no business reaching the other data routes.
test("render token does not unlock data routes the renderer never fetches", async () => {
  const { proxy } = await import("./proxy.ts");
  const { render } = await tokens();

  for (const path of ["/api/budget", "/api/analytics", "/api/trends"]) {
    expect(redirectedToLogin(proxy(buildRequest(`${path}?token=render-secret-123`))), path).toBe(true);
    expect(redirectedToLogin(proxy(buildRequest(path, { cookies: { render_token: render } }))), path).toBe(true);
  }
});

test("render cookie allows the data routes the rendered page fetches", async () => {
  const { proxy } = await import("./proxy.ts");
  const { render } = await tokens();

  const res = proxy(
    buildRequest("/api/dashboard", { cookies: { render_token: render } }),
  );
  expect(res.headers.get("location")).toBeNull();
});

test("render cookie does not allow routes that act on the account", async () => {
  const { proxy } = await import("./proxy.ts");
  const { render } = await tokens();

  const res = proxy(
    buildRequest("/api/email/send", { cookies: { render_token: render } }),
  );
  expect(redirectedToLogin(res)).toBe(true);
});

test("session cookie is not satisfied by the render token value", async () => {
  const { proxy } = await import("./proxy.ts");
  const { render } = await tokens();

  const res = proxy(buildRequest("/budget", { cookies: { auth_token: render } }));
  expect(redirectedToLogin(res)).toBe(true);
});

test("invalid render token redirects to login", async () => {
  const { proxy } = await import("./proxy.ts");
  const res = proxy(buildRequest("/budget?token=wrong-token"));
  expect(redirectedToLogin(res)).toBe(true);
});

test("no token and no cookie redirects to login", async () => {
  const { proxy } = await import("./proxy.ts");
  expect(redirectedToLogin(proxy(buildRequest("/budget")))).toBe(true);
});

test("valid auth cookie passes through", async () => {
  const { proxy } = await import("./proxy.ts");
  const { session } = await tokens();

  const res = proxy(buildRequest("/budget", { cookies: { auth_token: session } }));
  expect(res.headers.get("location")).toBeNull();
});

test("render token ignored when PDF_RENDER_AUTH_TOKEN is unset", async () => {
  delete process.env.PDF_RENDER_AUTH_TOKEN;
  const { proxy } = await import("./proxy.ts");

  expect(redirectedToLogin(proxy(buildRequest("/?token=render-secret-123")))).toBe(true);
});

test("everything is denied when SITE_PASSWORD is unset", async () => {
  delete process.env.SITE_PASSWORD;
  const { proxy } = await import("./proxy.ts");

  // Previously the expected cookie was derived from the literal string
  // "undefined", so this value authenticated.
  const forged = Buffer.from("actual-dashboard:undefined").toString("base64");
  const res = proxy(buildRequest("/budget", { cookies: { auth_token: forged } }));
  expect(redirectedToLogin(res)).toBe(true);
});

test("public routes pass through without auth", async () => {
  const { proxy } = await import("./proxy.ts");
  expect(proxy(buildRequest("/login")).headers.get("location")).toBeNull();
  expect(proxy(buildRequest("/api/auth/login")).headers.get("location")).toBeNull();
});
