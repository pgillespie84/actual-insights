import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
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

/** A reply that arrives and cannot be parsed: a proxy error page, a cut stream. */
function unreadableResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  } as unknown as Response;
}

/**
 * The panel logs every failure it reports, and these suites drive failure paths
 * on purpose, so a passing run would otherwise be a wall of stacks.
 *
 * React reports its own problems through the same channel, though, and this
 * file is built out of act() and fake timers — exactly where an "update was not
 * wrapped in act" warning is worth seeing. Those are collected and asserted on
 * after each test rather than thrown from inside the mock: React raises them
 * from inside a setState, which here always sits in a try whose catch logs
 * again, so throwing would re-enter this mock and escape as an unattributed
 * unhandled rejection instead of a failure pointing at the test.
 */
let logged: ReturnType<typeof vi.spyOn>;
let reactWarnings: string[];

beforeEach(() => {
  reactWarnings = [];
  logged = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const first = String(args[0] ?? "");
    if (first.includes("not wrapped in act")) reactWarnings.push(first);
  });
});

afterEach(() => {
  // Unmount inside the collection window. Testing Library registers its own
  // cleanup when it is imported, and Vitest runs afterEach hooks in reverse
  // registration order, so its would otherwise run after console.error has
  // been restored — and any act warning raised during unmount would go to the
  // real console unasserted.
  //
  // In a finally, so an unmount that throws cannot leave fake timers, a
  // stubbed fetch and a swallowed console for every test after it.
  try {
    cleanup();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
  expect(reactWarnings).toEqual([]);
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
  vi.stubGlobal("fetch", vi.fn(async () => unreadableResponse()));

  render(<MonthNotesPanel months={["2026-09"]} currentMonth="2026-09" />);

  // The server answered — a proxy error page, a truncated stream. Saying it
  // could not be reached would claim more than we know.
  await screen.findByText("The server's reply could not be read.");
});

test("a save that cannot reach the server says so rather than doing nothing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("Failed to fetch");
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

test("a delete that cannot reach the server says so", async () => {
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new TypeError("Failed to fetch");
      return jsonResponse(PAYLOAD);
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Delete" }).click();
  });

  expect(screen.getByText("Could not reach the server.")).toBeTruthy();
});

test("a blip mid-poll costs one attempt, not the whole wait", async () => {
  vi.useFakeTimers();

  let jobLooks = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      jobLooks += 1;
      // The connection drops on the first look and recovers on the second.
      if (jobLooks === 1) throw new TypeError("Failed to fetch");
      return jsonResponse({
        jobs: { insights: { state: "failed", message: "no API key" } },
      });
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  // The blip alone must not end the wait or report anything yet — but it is
  // the one failure path that reports itself, so it has to leave a trace, and
  // the assertion has to say which trace or it passes on any log at all.
  expect(screen.queryByText(/Regeneration failed/)).toBeNull();
  expect(logged).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Could not reach the server." }),
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText("Regeneration failed: no API key")).toBeTruthy();
});

test("a wait where nothing ever answered does not claim the job is still running", async () => {
  vi.useFakeTimers();

  // The notes endpoint is kept healthy deliberately, so the assertion is about
  // the poll's own flag. A real container restart takes both down, and the
  // reload's "could not reach" error would appear alongside this status line.

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      throw new TypeError("Failed to fetch");
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  // Sixty attempts, two seconds apart, none of them answered.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000 * 61);
  });

  expect(
    screen.getByText("Nothing answered while waiting — reload the page to see where it got to."),
  ).toBeTruthy();
});

test("a reply that parses but is not from the jobs endpoint costs an attempt, and says so", async () => {
  vi.useFakeTimers();

  let jobLooks = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      jobLooks += 1;
      // Something in front of the app answering 200 with its own envelope.
      if (jobLooks === 1) return jsonResponse({ error: "bad gateway" });
      return jsonResponse({
        jobs: { insights: { state: "failed", message: "no API key" } },
      });
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  // Nothing threw, so without an explicit log this would be a silent wait with
  // an empty console — the gap the poll's catch was given a log to close.
  expect(logged).toHaveBeenCalledWith("The jobs endpoint answered without a jobs object.");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  // Reaching this at all means the malformed reply did not end the wait.
  expect(screen.getByText("Regeneration failed: no API key")).toBeTruthy();
});

test("two minutes of replies from something that is not the jobs endpoint says that", async () => {
  vi.useFakeTimers();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      return jsonResponse({ error: "bad gateway" });
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000 * 61);
  });

  // Something replied sixty times, so "nothing answered" would be wrong — but
  // nothing ever looked at the job, so "still running" would be a claim about
  // something unobserved.
  expect(
    screen.getByText(
      "Something answered while waiting, but not the jobs endpoint — check what is in front of the app.",
    ),
  ).toBeTruthy();
});

test("an endpoint that keeps erroring is not blamed on whatever is in front of it", async () => {
  vi.useFakeTimers();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      return jsonResponse({ error: "boom" }, 500);
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000 * 61);
  });

  // The app's own endpoint is erroring. Sending the reader to check the proxy
  // would be pointing at the wrong thing entirely.
  expect(
    screen.getByText("The jobs endpoint answered HTTP 500 — reload the page to see where it got to."),
  ).toBeTruthy();
});

test("a gateway status is not blamed on the app behind it", async () => {
  vi.useFakeTimers();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      return jsonResponse({}, 502);
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000 * 61);
  });

  // 502 is what a proxy returns for a backend it could not reach. Inferring
  // provenance from a status code is the guess this panel refuses to make
  // about a body that parses, and it is no safer here.
  expect(
    screen.getByText("Got HTTP 502 while waiting — check what is in front of the app."),
  ).toBeTruthy();
});

test("a reply nothing could read is not reported as the job still running", async () => {
  vi.useFakeTimers();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/notes")) return jsonResponse(PAYLOAD);
      if (init?.method === "POST") return jsonResponse({ started: "insights" });
      return unreadableResponse();
    }),
  );

  await renderPanel();
  await act(async () => {
    screen.getByRole("button", { name: "Regenerate now" }).click();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000 * 61);
  });

  // Something answered sixty times and nothing ever read the job, so calling
  // it still running would be a claim about something never observed.
  expect(
    screen.getByText(
      "Something answered while waiting but the reply could not be read — check what is in front of the app.",
    ),
  ).toBeTruthy();
});
