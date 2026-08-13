/**
 * Derives the rate-limit bucket key for an inbound request.
 *
 * `X-Forwarded-For` is set by the client unless something trusted in front of
 * the app overwrites it. Nothing fronts this app by default — the container
 * publishes its port directly — so the header is not trusted here and every
 * direct client shares one bucket.
 */

/** Bucket shared by all clients when no trusted proxy is declared. */
export const DIRECT_KEY = "direct";

/** Longest textual IP address there is: IPv4-mapped IPv6. */
const MAX_KEY_LENGTH = 45;

/**
 * The key ends up in the log on every failed login, so it is attacker-facing
 * output even behind a trusted proxy. Drop control characters, which would
 * otherwise let a hostile header smuggle ANSI escapes or tabs into `docker
 * logs`, and cap the length.
 */
function sanitize(value: string): string {
  return [...value]
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .slice(0, MAX_KEY_LENGTH);
}

export function clientKey(headers: Headers): string {
  if (!process.env.TRUSTED_PROXY) return DIRECT_KEY;

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return DIRECT_KEY;

  return sanitize(forwarded.split(",")[0]!.trim()) || DIRECT_KEY;
}
