"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Shown when the app is running on config/dashboard.example.json.
 *
 * The container did exactly that for months without anyone noticing, because
 * the fallback is silent and the resulting numbers look plausible. A log line
 * was not enough — this is the same information where it cannot be missed.
 *
 * `missingPath` changes what the banner asks for. Telling someone who has
 * already set DASHBOARD_CONFIG to set DASHBOARD_CONFIG sends them to check
 * the one thing that is not wrong; naming the path that was looked for, and
 * where, is the whole of the answer.
 */
export function PlaceholderConfigBanner({
  missingPath = null,
}: {
  missingPath?: string | null;
}) {
  const searchParams = useSearchParams();

  // Same guard as Nav: this must not appear in the emailed PDF.
  if (searchParams.get("print") === "1") return null;

  return (
    <div className="border-b border-warning-border bg-warning-bg px-6 py-3 text-sm text-warning-text">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">Running on placeholder config.</span>
        <span>
          Account and category names are examples, so filters, buckets and net worth
          groups match nothing real.{" "}
          {missingPath === null ? (
            <>Set DASHBOARD_CONFIG_JSON or DASHBOARD_CONFIG.</>
          ) : (
            <>
              DASHBOARD_CONFIG is set to <code>{missingPath}</code>, but there is no
              file there — in a container it has to be the path inside the container,
              not the host directory.
            </>
          )}
        </span>
        <Link href="/admin" className="underline underline-offset-2 hover:no-underline">
          Details
        </Link>
      </div>
    </div>
  );
}
