import { test, expect } from "vitest";
import { topRowGridClass, bottomRowGridClass } from "./gridLayout";

test("top row uses grid-cols-3 directly when print", () => {
  const cls = topRowGridClass(true);
  expect(cls).toContain("grid-cols-3");
  expect(cls).not.toContain("lg:");
});

test("top row uses lg:grid-cols-3 when not print", () => {
  const cls = topRowGridClass(false);
  expect(cls).toContain("lg:grid-cols-3");
});

test("top row gap is tighter when print", () => {
  expect(topRowGridClass(true)).toContain("gap-4");
  expect(topRowGridClass(false)).toContain("gap-6");
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
