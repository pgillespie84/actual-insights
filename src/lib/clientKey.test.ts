import { test, expect, beforeEach } from "vitest";
import { clientKey } from "./clientKey.ts";

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.TRUSTED_PROXY;
});

const ESC = String.fromCharCode(27);
const TAB = String.fromCharCode(9);

function hasControlChars(value: string): boolean {
  return [...value].some((c) => {
    const code = c.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

// Nothing fronts this app by default, so X-Forwarded-For is whatever the client
// chose to send. If a varying header yields varying keys, an attacker gets a
// fresh rate-limit bucket per request and the lockout never trips.
test("a spoofed X-Forwarded-For cannot produce distinct keys when no proxy is trusted", () => {
  const a = clientKey(new Headers({ "x-forwarded-for": "203.0.113.9" }));
  const b = clientKey(new Headers({ "x-forwarded-for": "198.51.100.4" }));

  expect(a).toBe(b);
});

// Behind a proxy that overwrites the header, per-client buckets are both safe
// and desirable. The leftmost entry is the originating client; the rest are the
// proxy hops.
test("uses the leftmost X-Forwarded-For address when a proxy is trusted", () => {
  process.env.TRUSTED_PROXY = "1";

  expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" })))
    .toBe("203.0.113.9");
});

// The key is written to the log on every failed login, so it is attacker-facing
// output. Newlines cannot reach us, because the Headers API and Node's HTTP
// parser both reject them outright, but tabs, ANSI escapes and unbounded length
// all get through and still corrupt `docker logs` for whoever is reading it.
// 45 is the longest possible textual IP address (IPv4-mapped IPv6).
test("the key is safe to log", () => {
  process.env.TRUSTED_PROXY = "1";
  const hostile = `1.2.3.4${ESC}[31m${TAB}ADMIN` + "x".repeat(500);

  const key = clientKey(new Headers({ "x-forwarded-for": hostile }));

  expect(hasControlChars(key)).toBe(false);
  expect(key.length).toBeLessThanOrEqual(45);
});
