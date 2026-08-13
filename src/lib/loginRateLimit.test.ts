import { test, beforeEach, expect } from "vitest";
import {
  checkLoginAllowed,
  clearLoginAttempts,
  recordLoginFailure,
  resetLoginRateLimit,
} from "./loginRateLimit.ts";

beforeEach(() => {
  resetLoginRateLimit();
});

const IP = "192.0.2.10";

test("an unseen client is allowed", () => {
  expect(checkLoginAllowed(IP)).toEqual({ allowed: true, retryAfterSeconds: 0 });
});

test("failures below the threshold do not lock the client out", () => {
  for (let i = 0; i < 4; i++) recordLoginFailure(IP);
  expect(checkLoginAllowed(IP).allowed).toBe(true);
});

test("the fifth failure locks the client out", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure(IP);

  const gate = checkLoginAllowed(IP);
  expect(gate.allowed).toBe(false);
  expect(gate.retryAfterSeconds).toBeGreaterThan(0);
});

test("lockout grows with each further failure", () => {
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordLoginFailure(IP, now);
  const first = checkLoginAllowed(IP, now).retryAfterSeconds;

  const second = recordLoginFailure(IP, now).lockedUntil - now;
  expect(second).toBeGreaterThan(first * 1000);
});

test("lockout is capped", () => {
  const now = Date.now();
  for (let i = 0; i < 40; i++) recordLoginFailure(IP, now);

  expect(checkLoginAllowed(IP, now).retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
});

test("the client is allowed again once the lockout expires", () => {
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordLoginFailure(IP, now);

  expect(checkLoginAllowed(IP, now).allowed).toBe(false);
  expect(checkLoginAllowed(IP, now + 16 * 60 * 1000).allowed).toBe(true);
});

test("a quiet spell resets the failure count", () => {
  const now = Date.now();
  for (let i = 0; i < 4; i++) recordLoginFailure(IP, now);

  const later = now + 16 * 60 * 1000;
  expect(recordLoginFailure(IP, later).failures).toBe(1);
});

test("a successful login clears the record", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure(IP);
  expect(checkLoginAllowed(IP).allowed).toBe(false);

  clearLoginAttempts(IP);
  expect(checkLoginAllowed(IP).allowed).toBe(true);
});

// Per-key counters alone are defeated by anyone who can present many keys: each
// key stays one failure below its own limit while the total climbs without
// bound. A ceiling on total failures closes that off no matter how the keys are
// spread. Every key here fails only once, so no per-key lockout is in play.
test("many distinct keys cannot exceed the global failure ceiling", () => {
  const now = Date.now();
  for (let i = 0; i < 50; i++) recordLoginFailure(`198.51.100.${i}`, now);

  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(false);
});

// The ceiling is checked before the password is, so without this a legitimate
// user cannot get back in until the window expires — the correct password is
// rejected too. Reaching this requires knowing the password, so an attacker
// cannot use it to reset their own attempts.
test("a successful login clears the global ceiling", () => {
  const now = Date.now();
  for (let i = 0; i < 50; i++) recordLoginFailure(`198.51.100.${i}`, now);
  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(false);

  clearLoginAttempts("203.0.113.77");

  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(true);
});

test("clients are tracked independently", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure(IP);

  expect(checkLoginAllowed(IP).allowed).toBe(false);
  expect(checkLoginAllowed("192.0.2.99").allowed).toBe(true);
});
