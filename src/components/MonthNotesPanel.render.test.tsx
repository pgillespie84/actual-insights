import { test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MonthNotesPanel } from "./MonthNotesPanel";

/**
 * The panel's failure paths, which the pure-function tests cannot reach.
 *
 * The thing worth pinning: whatever else goes wrong, the panel says something.
 * Every one of these cases has at some point ended with a silent no-op, which
 * is the failure this whole feature exists to remove one layer down.
 */

const NOTE = {
  id: "n1",
  monthStart: "2026-09",
  monthEnd: null,
  note: "Redid the front walkway",
  createdAt: "2026-09-16T12:00:00.000Z",
};

const PAYLOAD = { notes: [NOTE], insights: {} };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function renderPanel() {
  render(<MonthNotesPanel months={["2026-09"]} currentMonth="2026-09" />);
  await screen.findByText(NOTE.note);
}

test("a notes fetch that rejects outright still puts something on screen", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );

  render(<MonthNotesPanel months={["2026-09"]} currentMonth="2026-09" />);

  // Without the catch inside load(), this rejection escapes and the panel
  // renders an empty list with no explanation.
  await screen.findByText("Could not reach the server.");
});

test("a failed job reports why, even when the reload fails too", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });

  let notesCalls = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/admin/notes")) {
      notesCalls += 1;
      // First load succeeds so the note renders; the reload after the failed
      // job rejects, which is the case that used to swallow the job's reason.
      if (notesCalls === 1) return jsonResponse(PAYLOAD);
      throw new TypeError("Failed to fetch");
    }
    if (init?.method === "POST") return jsonResponse({ started: "insights" });
    return jsonResponse({
      jobs: { insights: { state: "failed", message: "no API key" } },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await waitFor(
    () => {
      expect(screen.getByText("Regeneration failed: no API key")).toBeTruthy();
    },
    { timeout: 10000 },
  );
});
