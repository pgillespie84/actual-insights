"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/budget", label: "Budget" },
  { href: "/trends", label: "Trends" },
  { href: "/analytics", label: "Analytics" },
  { href: "/admin", label: "Admin" },
];

/**
 * Two rows on a phone, one bar from `sm` up.
 *
 * Five links plus the wordmark and the theme toggle need about 630px. On a
 * 375px screen that pushed Analytics, Admin and the toggle off the right edge
 * and made the whole document scroll sideways — every page under it inherited
 * the horizontal scroll, not just the nav. The links get their own row below
 * the wordmark instead, as a five-column grid so nothing is hidden behind a
 * scroll gesture.
 */
export function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (searchParams.get("print") === "1") return null;

  return (
    <nav className="border-b border-card-border bg-card-bg backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:py-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M2.273 5.625A4.483 4.483 0 0 1 5.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0 0 18.75 3H5.25a3 3 0 0 0-2.977 2.625ZM2.273 8.625A4.483 4.483 0 0 1 5.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0 0 18.75 6H5.25a3 3 0 0 0-2.977 2.625ZM5.25 9a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h13.5a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H15a.75.75 0 0 0-.75.75 2.25 2.25 0 0 1-4.5 0A.75.75 0 0 0 9 9H5.25Z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-text-primary">Budget</span>
          </div>
          {/* On one row the toggle sits at the end of the links instead. */}
          <div className="sm:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 sm:flex sm:items-center">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-1 py-2 text-center text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                  isActive
                    ? "bg-hover-bg text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-hover-bg"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="ml-2 hidden border-l border-card-border pl-2 sm:block">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
