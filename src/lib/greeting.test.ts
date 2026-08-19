import { test, expect } from "vitest";
import { greetingForHour } from "./greeting.ts";

test("morning runs from 5am to 11am", () => {
  expect(greetingForHour(5)).toBe("Good morning");
  expect(greetingForHour(11)).toBe("Good morning");
});

test("afternoon runs from noon to 4pm", () => {
  expect(greetingForHour(12)).toBe("Good afternoon");
  expect(greetingForHour(16)).toBe("Good afternoon");
});

test("evening runs from 5pm to 4am", () => {
  expect(greetingForHour(17)).toBe("Good evening");
  expect(greetingForHour(23)).toBe("Good evening");
  expect(greetingForHour(0)).toBe("Good evening");
  expect(greetingForHour(4)).toBe("Good evening");
});
