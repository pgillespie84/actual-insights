import { test, expect } from "vitest";
import { banRowGridClass, bottomRowGridClass } from "./gridLayout";

// Three columns at every width. They fit on a phone because MetricBan shrinks
// the type below `sm`, not because a 30px figure fits in a 104px card — it
// does not, which is what this row used to get wrong. See MetricBan.
test("metric row is three columns at every width", () => {
  expect(banRowGridClass(false)).toContain("grid-cols-3");
  expect(banRowGridClass(false)).not.toContain("grid-cols-1");
  expect(banRowGridClass(true)).toContain("grid-cols-3");
});

// The gutter is worth more as card width on a phone, so it tightens below `sm`.
test("metric row gap tightens below sm", () => {
  expect(banRowGridClass(false)).toContain("gap-2");
  expect(banRowGridClass(false)).toContain("sm:gap-4");
});

test("metric row gap is tighter when print", () => {
  expect(banRowGridClass(true)).toContain("gap-3");
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
