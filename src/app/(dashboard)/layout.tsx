import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { PlaceholderConfigBanner } from "@/components/PlaceholderConfigBanner";
import { CONFIG_SOURCE } from "@/lib/constants";

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
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </>
  );
}
