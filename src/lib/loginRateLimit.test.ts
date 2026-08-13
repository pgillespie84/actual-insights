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

/** Mirrors GLOBAL_MAX_FAILURES in loginRateLimit.ts. */
const GLOBAL_MAX_FAILURES = 20;

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

// A success used to zero the global counter outright, which handed an attacker
// a fresh budget every time a household member signed in. It now forgives a
// bounded amount instead, so a legitimate login relieves pressure without
// refilling the whole budget.
//
// These call clearLoginAttempts directly and so prove nothing about the route —
// while the ceiling is active the route never reaches this function at all.
// That ordering is pinned separately in src/app/api/auth/login/route.test.ts.
test("a successful login does not refill the whole global budget", () => {
  const now = Date.now();
  for (let i = 0; i < 50; i++) recordLoginFailure(`198.51.100.${i}`, now);
  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(false);

  clearLoginAttempts("203.0.113.77");

  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(false);
});

// The point of forgiving anything at all: a household member's own typos, and
// any failures that accumulated before they signed in, should not push a later
// unrelated attempt over the ceiling.
test("a successful login forgives some of the accumulated failures", () => {
  const now = Date.now();
  for (let i = 0; i < 19; i++) recordLoginFailure(`198.51.100.${i}`, now);

  // One more failure would reach the ceiling.
  clearLoginAttempts("203.0.113.77");

  recordLoginFailure("198.51.100.200", now);
  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(true);
});

test("clients are tracked independently", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure(IP);

  expect(checkLoginAllowed(IP).allowed).toBe(false);
  expect(checkLoginAllowed("192.0.2.99").allowed).toBe(true);
});

// The global counter used to sit at its ceiling until the whole 15-minute
// window flipped, so tripping it locked the household out for up to 15 minutes
// — and a correct password cannot relieve that, because the route gates before
// it verifies. Draining the counter steadily makes the lockout self-clearing:
// the budget is still 20 failures per 15 minutes, but it refills continuously
// rather than all at once.
test("the global counter drains over time", () => {
  const now = Date.now();
  for (let i = 0; i < 20; i++) recordLoginFailure(`198.51.100.${i}`, now);
  expect(checkLoginAllowed("203.0.113.77", now).allowed).toBe(false);

  // 15 minutes / 20 failures = one failure forgiven every 45 seconds.
  const later = now + 45 * 1000;
  expect(checkLoginAllowed("203.0.113.77", later).allowed).toBe(true);
});

test("retryAfterSeconds reflects the drain, not the whole window", () => {
  const now = Date.now();
  for (let i = 0; i < 20; i++) recordLoginFailure(`198.51.100.${i}`, now);

  const { retryAfterSeconds } = checkLoginAllowed("203.0.113.77", now);
  expect(retryAfterSeconds).toBeGreaterThan(0);
  expect(retryAfterSeconds).toBeLessThanOrEqual(45);
});

// The drain must not become a bypass. A draining counter is a token bucket: it
// holds 20 guesses of burst and refills one every 45 seconds, so an attacker
// who hammers the gate gets the burst once and is then held to the refill rate
// forever after.
//
// Written as a simulation because the property that matters is the rate over
// time. The first window is allowed the burst on top of the refill; what must
// not drift upwards is the sustained rate, so that is measured separately.
test("hammering the gate is held to the refill rate", () => {
  const start = Date.now();
  let firstWindow = 0;
  let secondWindow = 0;

  // One attempt per second for 30 minutes, each from a fresh key so no per-key
  // lockout is doing the work.
  for (let second = 0; second < 1800; second++) {
    const at = start + second * 1000;
    const key = `198.51.100.${second % 250}`;
    if (checkLoginAllowed(key, at).allowed) {
      if (second < 900) firstWindow++;
      else secondWindow++;
      recordLoginFailure(key, at);
    }
  }

  // Burst plus refill.
  expect(firstWindow).toBeLessThanOrEqual(GLOBAL_MAX_FAILURES * 2 + 1);
  // Steady state: the refill rate alone.
  expect(secondWindow).toBeLessThanOrEqual(GLOBAL_MAX_FAILURES + 1);
});
