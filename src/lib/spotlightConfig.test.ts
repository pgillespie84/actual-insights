import { test, expect } from "vitest";
import { parseSpotlightCategories } from "./spotlightConfig.ts";

test("returns 3-item list when env is valid", () => {
  expect(parseSpotlightCategories("Grocery,Takeout,Subscriptions")).toEqual(
    ["Grocery", "Takeout", "Subscriptions"],
  );
});

test("trims whitespace around entries", () => {
  expect(parseSpotlightCategories("  Grocery , Takeout , Subscriptions  ")).toEqual(
    ["Grocery", "Takeout", "Subscriptions"],
  );
});

test("returns null when env is undefined", () => {
  expect(parseSpotlightCategories(undefined)).toBeNull();
});

test("returns null when env is empty string", () => {
  expect(parseSpotlightCategories("")).toBeNull();
});

test("returns null when fewer than 3 entries", () => {
  expect(parseSpotlightCategories("Grocery,Takeout")).toBeNull();
});

test("returns null when more than 3 entries", () => {
  expect(parseSpotlightCategories("A,B,C,D")).toBeNull();
});

test("returns null when an entry is empty after trim", () => {
  expect(parseSpotlightCategories("Grocery, ,Subscriptions")).toBeNull();
});

test("preserves multi-word category names", () => {
  expect(parseSpotlightCategories("Play & Fun,Takeout,Subscriptions")).toEqual(
    ["Play & Fun", "Takeout", "Subscriptions"],
  );
});
