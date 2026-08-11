import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock next/navigation before importing hook
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

const { useMonthlyData } = await import("./useMonthlyData");

function mockFetch(data: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset search params
  mockSearchParams.delete("month");
});

test("fetches from endpoint on mount and returns data", async () => {
  const payload = { monthKey: "2026-01", availableMonths: ["2026-01", "2025-12"], items: [1] };
  mockFetch(payload);

  const { result } = renderHook(() => useMonthlyData<typeof payload>("/api/test"));

  expect(result.current.loading).toBe(true);

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.data).toEqual(payload);
  expect(result.current.selectedMonth).toBe("2026-01");
  expect(result.current.error).toBeNull();
  expect(global.fetch).toHaveBeenCalledWith("/api/test");
});

test("forwards URL month param to endpoint", async () => {
  mockSearchParams.set("month", "2025-06");
  const payload = { monthKey: "2025-06", availableMonths: ["2025-06"] };
  mockFetch(payload);

  const { result } = renderHook(() => useMonthlyData<typeof payload>("/api/test"));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(global.fetch).toHaveBeenCalledWith("/api/test?month=2025-06");
  expect(result.current.data?.monthKey).toBe("2025-06");
});

test("setMonth triggers refetch with new month", async () => {
  const payload = { monthKey: "2026-01", availableMonths: ["2026-01", "2025-12"] };
  mockFetch(payload);

  const { result } = renderHook(() => useMonthlyData<typeof payload>("/api/test"));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const updated = { monthKey: "2025-12", availableMonths: ["2026-01", "2025-12"] };
  mockFetch(updated);

  act(() => result.current.setMonth("2025-12"));

  await waitFor(() => expect(result.current.data?.monthKey).toBe("2025-12"));
  expect(result.current.selectedMonth).toBe("2025-12");
  expect(global.fetch).toHaveBeenCalledWith("/api/test?month=2025-12");
});

test("sets error state on fetch failure", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

  const { result } = renderHook(() => useMonthlyData("/api/test"));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe("Fetch failed: 500");
  expect(result.current.data).toBeNull();
});

test("custom getMonthKey extracts month from nested path", async () => {
  const payload = { summary: { monthKey: "2026-03" }, availableMonths: ["2026-03"] };
  mockFetch(payload);

  const { result } = renderHook(() =>
    useMonthlyData<typeof payload>("/api/budget", {
      getMonthKey: (d) => d.summary.monthKey,
    })
  );

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.selectedMonth).toBe("2026-03");
});
