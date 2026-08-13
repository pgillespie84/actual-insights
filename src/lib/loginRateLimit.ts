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

/**
 * Ceiling on total failures across every key, which closes off the attack the
 * per-key counters cannot see: presenting many keys so each stays just under
 * its own limit while the total climbs without bound.
 *
 * The counter drains steadily rather than resetting when a window ends, so the
 * budget is 20 failures per 15 minutes however they are spaced. Draining is
 * what makes the ceiling safe to trip: the route gates before it verifies a
 * password, so while the ceiling is active nobody can log in at all, and a
 * counter that sat at its limit for the rest of a fixed window locked the
 * household out for up to 15 minutes. Now it clears itself in 45 seconds.
 */
const GLOBAL_MAX_FAILURES = 20;
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;

/** One failure is forgiven every 45 seconds. */
const GLOBAL_DRAIN_MS = GLOBAL_WINDOW_MS / GLOBAL_MAX_FAILURES;

/**
 * How much of the global counter a successful login forgives. Sized to one
 * client's own per-key allowance: enough to absorb a household member's typos,
 * far short of the whole budget.
 */
const SUCCESS_CREDIT = MAX_ATTEMPTS;

let globalFailures = 0;
let globalUpdatedAt = 0;

/** The global count as it stands at `now`, with elapsed time drained off it. */
function drainedGlobalFailures(now: number): number {
  if (globalFailures === 0) return 0;
  const drained = (now - globalUpdatedAt) / GLOBAL_DRAIN_MS;
  return Math.max(0, globalFailures - drained);
}

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
  const global = drainedGlobalFailures(now);
  if (global >= GLOBAL_MAX_FAILURES) {
    // Time to drain a whole failure off the count, capped at the window so the
    // Retry-After hint can never exceed it. Rounding up to the next full slot
    // overstates the wait a little — the gate reopens as soon as the count is
    // fractionally under the ceiling — but a client that honours the hint then
    // always succeeds instead of retrying into another 429.
    const excess = global - (GLOBAL_MAX_FAILURES - 1);
    const waitMs = Math.min(excess * GLOBAL_DRAIN_MS, GLOBAL_WINDOW_MS);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

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

  globalFailures = drainedGlobalFailures(now) + 1;
  globalUpdatedAt = now;

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

/**
 * Called after a successful login.
 *
 * Clears the key's own record, and forgives a bounded slice of the global
 * counter rather than zeroing it. Zeroing meant every household sign-in handed
 * a patient attacker a fresh budget of guesses. The credit is enough to absorb
 * one person's typos and any failures that piled up before they signed in,
 * which is all it was ever needed for. Reaching this function requires knowing
 * the password, so an attacker cannot use it to reset their own attempts.
 *
 * Note what this does NOT do. The route gates on checkLoginAllowed before it
 * verifies the password, so once the ceiling is active this function is
 * unreachable and a correct password is refused like any other — see the
 * characterisation test in src/app/api/auth/login/route.test.ts. That is the
 * control working as intended: checking the password while locked out would let
 * an attacker keep guessing at full rate. The lockout is short rather than
 * permanent: a gated request returns before recordLoginFailure, so the counter
 * stops growing, and the drain puts it back under the ceiling in 45 seconds.
 */
export function clearLoginAttempts(key: string, now: number = Date.now()): void {
  attempts.delete(key);
  globalFailures = Math.max(0, drainedGlobalFailures(now) - SUCCESS_CREDIT);
  globalUpdatedAt = now;
}

/** Test seam. Not used by application code. */
export function resetLoginRateLimit(): void {
  attempts.clear();
  globalFailures = 0;
  globalUpdatedAt = 0;
}
