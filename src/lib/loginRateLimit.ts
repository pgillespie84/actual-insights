/**
 * In-memory login throttle.
 *
 * The dashboard has a single shared password and no lockout, so once the auth
 * design is public the only thing between an exposed instance and entry is
 * guessing speed. This caps that speed.
 *
 * State is per-process and deliberately not persisted: the app runs as one
 * container, and losing the counters on restart is an acceptable trade for
 * having no extra dependency. An attacker who can restart the container has
 * already won.
 */

/** Failures allowed before the first lockout. */
const MAX_ATTEMPTS = 5;

/** A quiet spell this long clears the failure count. */
const WINDOW_MS = 15 * 60 * 1000;

/** First lockout, doubling with each further failure, up to MAX_LOCKOUT_MS. */
const BASE_LOCKOUT_MS = 30 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;

/** Prune threshold, so a burst of unique IPs cannot grow the map without end. */
const MAX_TRACKED_KEYS = 10_000;

type Attempt = {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
};

const attempts = new Map<string, Attempt>();

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil <= now && now - entry.lastFailureAt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

function lockoutFor(failures: number): number {
  const overage = failures - MAX_ATTEMPTS;
  if (overage < 0) return 0;
  return Math.min(BASE_LOCKOUT_MS * 2 ** overage, MAX_LOCKOUT_MS);
}

export function checkLoginAllowed(
  key: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };

  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  key: string,
  now: number = Date.now(),
): { failures: number; lockedUntil: number } {
  if (attempts.size > MAX_TRACKED_KEYS) prune(now);

  const previous = attempts.get(key);

  // A long enough gap since the last failure starts the count over.
  const stale = previous && now - previous.lastFailureAt > WINDOW_MS;
  const failures = !previous || stale ? 1 : previous.failures + 1;

  const lockout = lockoutFor(failures);
  const entry: Attempt = {
    failures,
    lastFailureAt: now,
    lockedUntil: lockout > 0 ? now + lockout : 0,
  };
  attempts.set(key, entry);

  return { failures, lockedUntil: entry.lockedUntil };
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}

/** Test seam. Not used by application code. */
export function resetLoginRateLimit(): void {
  attempts.clear();
}
