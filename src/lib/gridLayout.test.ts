import { test, expect } from "vitest";
import { banRowGridClass, bottomRowGridClass } from "./gridLayout";

// Three short numbers fit side by side even on a phone, so this row has no
// responsive prefix at all — unlike the bottom row, which holds charts.
test("metric row is three columns at every width", () => {
  expect(banRowGridClass(false)).toContain("grid-cols-3");
  expect(banRowGridClass(false)).not.toContain("lg:");
  expect(banRowGridClass(true)).toContain("grid-cols-3");
});

test("metric row gap is tighter when print", () => {
  expect(banRowGridClass(true)).toContain("gap-3");
  expect(banRowGridClass(false)).toContain("gap-4");
});

test("bottom row uses grid-cols-3 when print with spotlights", () => {
  const cls = bottomRowGridClass(true, true);
  expect(cls).toContain("grid-cols-3");
  expect(cls).not.toContain("lg:");
});

test("bottom row uses grid-cols-2 when print without spotlights", () => {
  const cls = bottomRowGridClass(true, false);
  expect(cls).toContain("grid-cols-2");
  expect(cls).not.toContain("lg:");
});

test("bottom row uses lg: prefix when not print", () => {
  const cls = bottomRowGridClass(false, true);
  expect(cls).toContain("lg:grid-cols-3");
});
