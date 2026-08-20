import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { PlaceholderConfigBanner } from "@/components/PlaceholderConfigBanner";
import { CONFIG_SOURCE } from "@/lib/constants";

/**
 * Render at request time, not at build time.
 *
 * Every page under this layout is a client component, so Next prerendered the
 * whole group as static HTML — and the CONFIG_SOURCE check below ran during
 * `next build` rather than in the container. CI builds the image from a clean
 * checkout, where config/dashboard.json is gitignored and DASHBOARD_CONFIG_JSON
 * is unset, so the prerender always resolved to the example file and baked the
 * placeholder banner into every published image. Setting the env var on the
 * container could not turn it off: the answer was already in the HTML.
 *
 * The static shell was worth nothing here anyway. These pages render a spinner
 * and fetch their data from the API routes, which are dynamic already.
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {CONFIG_SOURCE.isExample && (
        <Suspense fallback={null}>
          <PlaceholderConfigBanner />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Nav />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </>
  );
}
