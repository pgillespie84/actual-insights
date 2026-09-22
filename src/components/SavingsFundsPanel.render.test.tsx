import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";
import { SavingsFundsPanel } from "./SavingsFundsPanel";

/**
 * The entry grid's two promises, which only the rendered panel can keep.
 *
 * One: a box shows the figure the dashboard is currently showing, carried
 * ones included, so what is being overwritten is visible before it is
 * overwritten. Two: Save sends only the boxes that were actually changed —
 * sending the rest would stamp a carried figure as this month's confirmed
 * entry, and the dashboard would silently stop saying the figure is old.
 */

const GROUPS = [
  {
    group: "Short Term",
    total: 1183910,
    carriedCount: 1,
    funds: [
      {
        id: "a",
        name: "General Savings",
        group: "Short Term",
        archivedFrom: null,
        balance: 873922,
        asOf: "2026-09",
        carried: false,
        entered: true,
        change: 486056,
      },
      {
        id: "b",
        name: "Car Repair Fund",
        group: "Short Term",
        archivedFrom: null,
        balance: 309988,
        asOf: "2026-06",
        carried: true,
        entered: false,
        change: 0,
      },
    ],
  },
];

const FUNDS = [
  { id: "a", name: "General Savings", group: "Short Term", archivedFrom: null },
  { id: "b", name: "Car Repair Fund", group: "Short Term", archivedFrom: null },
];

const PAYLOAD = { monthKey: "2026-09", groups: GROUPS, funds: FUNDS };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPanel() {
  await act(async () => {
    render(<SavingsFundsPanel currentMonth="2026-09" />);
  });
}

test("a box is pre-filled with the figure the dashboard is showing", async () => {
  await renderPanel();

  expect(screen.getByLabelText("General Savings balance")).toHaveValue("8739.22");
  expect(screen.getByLabelText("Car Repair Fund balance")).toHaveValue("3099.88");
});

test("a carried figure says which month it came from", async () => {
  await renderPanel();

  expect(screen.getByText("carried from Jun 2026")).toBeInTheDocument();
  expect(screen.getByText("entered for this month")).toBeInTheDocument();
});

test("nothing can be saved until something changes", async () => {
  await renderPanel();

  expect(screen.getByRole("button", { name: "Nothing changed" })).toBeDisabled();
});

test("only the changed box is sent", async () => {
  await renderPanel();
  fetchMock.mockClear();
  fetchMock.mockResolvedValue(jsonResponse({ written: 1, cleared: 0, groups: GROUPS }));

  fireEvent.change(screen.getByLabelText("General Savings balance"), {
    target: { value: "9000" },
  });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
  });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/admin/funds/balances");
  // The untouched Car Repair box holds a figure carried from June. Sending it
  // back would record it as September's own, and nothing on the dashboard
  // would say the fund had not been checked in three months.
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({
    monthKey: "2026-09",
    entries: [{ fundId: "a", amount: "9000" }],
  });
});

test("an emptied box is sent, because clearing a figure is an instruction too", async () => {
  await renderPanel();
  fetchMock.mockClear();
  fetchMock.mockResolvedValue(jsonResponse({ written: 0, cleared: 1, groups: GROUPS }));

  fireEvent.change(screen.getByLabelText("General Savings balance"), {
    target: { value: "" },
  });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
  });

  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse((init as RequestInit).body as string).entries).toEqual([
    { fundId: "a", amount: "" },
  ]);
});

test("a rejected save says why instead of failing quietly", async () => {
  await renderPanel();
  fetchMock.mockResolvedValue(jsonResponse({ error: "That looks like a typo — check the number of zeros." }, 400));

  fireEvent.change(screen.getByLabelText("General Savings balance"), {
    target: { value: "99999999999" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
  });

  expect(screen.getByText(/check the number of zeros/)).toBeInTheDocument();
});

test("switching months with unsaved figures asks first, and stays put on no", async () => {
  await renderPanel();
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);

  fireEvent.change(screen.getByLabelText("General Savings balance"), {
    target: { value: "9000" },
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-08" } });
  });

  expect(confirm).toHaveBeenCalled();
  // The typed figure is still there, and still September's.
  expect(screen.getByLabelText("General Savings balance")).toHaveValue("9000");
  expect(screen.getByLabelText("Month")).toHaveValue("2026-09");
});

test("a failed load withholds the grid rather than labelling old figures with a new month", async () => {
  await renderPanel();
  fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 500));

  await act(async () => {
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-08" } });
  });

  // Showing September's pre-fills under an August label is how a figure gets
  // saved against the wrong month.
  expect(screen.queryByLabelText("General Savings balance")).not.toBeInTheDocument();
  // And it says it failed rather than claiming to still be loading, which
  // would contradict the error banner beside it and offer no way out.
  expect(screen.queryByText("Loading 2026-08…")).not.toBeInTheDocument();
  expect(screen.getByText(/Could not load 2026-08/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

test("adding a fund says so, and the reload that follows does not wipe it", async () => {
  await renderPanel();
  fetchMock.mockClear();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ fund: { id: "z" } }))
    .mockResolvedValue(jsonResponse(PAYLOAD));

  fireEvent.change(screen.getByPlaceholderText("Car Repair Fund"), {
    target: { value: "Tax Fund" },
  });
  fireEvent.change(screen.getByLabelText("Group for new fund"), {
    target: { value: "Short Term" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  });

  // Clearing the status inside load() wiped this in the same render that set
  // it, so adding a fund looked like nothing had happened.
  expect(screen.getByText("Added Tax Fund.")).toBeInTheDocument();
});

test("a late reply from an abandoned month cannot take over the grid", async () => {
  await renderPanel();

  // August answers after July was asked for. Letting it land would set the
  // grid to August under a July picker, and the grid would then be withheld
  // indefinitely with nothing to clear it.
  let releaseAugust: (value: Response) => void = () => {};
  fetchMock.mockImplementationOnce(
    () => new Promise<Response>((resolve) => (releaseAugust = resolve)),
  );
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-08" } });
  });

  fetchMock.mockResolvedValue(jsonResponse({ ...PAYLOAD, monthKey: "2026-07" }));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-07" } });
  });

  await act(async () => {
    releaseAugust(jsonResponse({ ...PAYLOAD, monthKey: "2026-08" }));
  });

  expect(screen.getByLabelText("General Savings balance")).toBeInTheDocument();
  expect(screen.queryByText(/Loading 2026-07/)).not.toBeInTheDocument();
});

test("an empty list points at the import rather than looking broken", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ monthKey: "2026-09", groups: [], funds: [] }));
  await renderPanel();

  expect(screen.getByText(/No funds yet/)).toBeInTheDocument();
});
