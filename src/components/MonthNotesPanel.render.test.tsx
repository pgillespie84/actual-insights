import { test, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
  // The initial load resolves on microtasks, so no clock has to move for it.
  await act(async () => {});
  expect(screen.getByText(NOTE.note)).toBeTruthy();
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
  // Explicit clock rather than shouldAdvanceTime: the poll waits two seconds
  // between attempts, and advancing it by hand makes that instant and exact
  // instead of two real seconds against a five-second test budget.
  vi.useFakeTimers();

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

  // One poll interval is enough: the job reports "failed" on the first look.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });

  expect(screen.getByText("Regeneration failed: no API key")).toBeTruthy();
});

test("a reply that arrives but cannot be read is not reported as unreachable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    })),
  );

  render(<MonthNotesPanel months={["2026-09"]} currentMonth="2026-09" />);

  // The server answered — a proxy error page, a truncated stream. Saying it
  // could not be reached would claim more than we know.
  await screen.findByText("The server's reply could not be read.");
});

test("a save that cannot reach the server says so rather than doing nothing", async () => {
  let notesCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      notesCalls += 1;
      if (init?.method === "POST") throw new TypeError("Failed to fetch");
      if (notesCalls === 1) return jsonResponse(PAYLOAD);
      return jsonResponse(PAYLOAD);
    }),
  );

  await renderPanel();

  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(textarea, "Water heater died");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await act(async () => {
    screen.getByRole("button", { name: "Save note" }).click();
  });

  expect(screen.getByText("Could not reach the server.")).toBeTruthy();
});
