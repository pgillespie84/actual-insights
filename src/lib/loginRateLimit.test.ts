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

test("clients are tracked independently", () => {
  for (let i = 0; i < 5; i++) recordLoginFailure(IP);

  expect(checkLoginAllowed(IP).allowed).toBe(false);
  expect(checkLoginAllowed("192.0.2.99").allowed).toBe(true);
});
