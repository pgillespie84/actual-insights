import { test, beforeEach, expect } from "vitest";
import { verifyPassword, isValidRenderToken, getAuthCookie } from "./auth.ts";
import { renderToken, sessionToken } from "./authToken.ts";

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.SITE_PASSWORD = "s3cret";
  process.env.PDF_RENDER_AUTH_TOKEN = "render-tok-abc";
});

test("verifyPassword returns true for correct password", () => {
  expect(verifyPassword("s3cret")).toBe(true);
});

test("verifyPassword returns false for wrong password", () => {
  expect(verifyPassword("wrong")).toBe(false);
});

test("verifyPassword returns false for empty string", () => {
  expect(verifyPassword("")).toBe(false);
});

test("verifyPassword returns false when SITE_PASSWORD is unset", () => {
  delete process.env.SITE_PASSWORD;
  expect(verifyPassword("anything")).toBe(false);
});

test("isValidRenderToken returns true for matching token", () => {
  expect(isValidRenderToken("render-tok-abc")).toBe(true);
});

test("isValidRenderToken returns false for wrong token", () => {
  expect(isValidRenderToken("bad-token")).toBe(false);
});

test("isValidRenderToken returns false when env var is unset", () => {
  delete process.env.PDF_RENDER_AUTH_TOKEN;
  expect(isValidRenderToken("render-tok-abc")).toBe(false);
});

test("getAuthCookie returns an httpOnly cookie holding the session token", () => {
  const cookie = getAuthCookie();
  expect(cookie.name).toBe("auth_token");
  expect(cookie.value).toBe(sessionToken());
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.path).toBe("/");
  expect(cookie.maxAge).toBe(60 * 60 * 24 * 30);
});

// The cookie used to be base64("actual-dashboard:" + password), so anyone who
// read it recovered SITE_PASSWORD by decoding. It must stay one-way.
test("auth cookie does not disclose the password", () => {
  const { value } = getAuthCookie();

  expect(value).toMatch(/^[0-9a-f]{64}$/);
  expect(value).not.toContain("s3cret");
  expect(Buffer.from(value, "base64").toString("utf8")).not.toContain("s3cret");
});

test("getAuthCookie throws when SITE_PASSWORD is unset", () => {
  delete process.env.SITE_PASSWORD;
  expect(() => getAuthCookie()).toThrow(/SITE_PASSWORD/);
});

// A render cookie must never satisfy a session check, or a leaked
// PDF_RENDER_AUTH_TOKEN would be equivalent to the site password.
test("session and render tokens are not interchangeable", () => {
  expect(renderToken()).not.toBe(sessionToken());
});

test("sessionToken is null when SITE_PASSWORD is unset so checks fail closed", () => {
  delete process.env.SITE_PASSWORD;
  expect(sessionToken()).toBeNull();
});
