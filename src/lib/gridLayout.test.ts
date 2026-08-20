import { test, expect } from "vitest";
import { banRowGridClass, bottomRowGridClass } from "./gridLayout";

// Three columns at every width. They fit on a phone because MetricBan shrinks
// the type below `sm`, not because a 30px figure fits in a 104px card — it
// does not, which is what this row used to get wrong. See MetricBan.
test("metric row is three columns at every width", () => {
  expect(banRowGridClass(false)).toContain("grid-cols-3");
  expect(banRowGridClass(true)).toContain("grid-cols-3");
  // Guards the whole class of regressions, not one literal: any breakpoint
  // prefix on the column count means the row stacks somewhere.
  expect(banRowGridClass(false)).not.toMatch(/(sm|md|lg|xl):grid-cols-/);
  expect(banRowGridClass(true)).not.toMatch(/(sm|md|lg|xl):grid-cols-/);
});

// The gutter is worth more as card width on a phone, so it tightens below `sm`.
test("metric row gap tightens below sm", () => {
  expect(banRowGridClass(false)).toContain("gap-2");
  expect(banRowGridClass(false)).toContain("sm:gap-4");
});

test("print metric row has one gap at every width", () => {
  expect(banRowGridClass(true)).toContain("gap-3");
  // Print renders at a fixed desktop width, so a breakpoint would be dead
  // weight that reads as if the PDF could ever be narrow.
  expect(banRowGridClass(true)).not.toContain("sm:");
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
