import { test, expect } from "vitest";
import { handleSyncResult } from "./scheduler";

test("success after success: no alert", () => {
  const result = handleSyncResult(0, 500, "success");
  expect(result.logStatus).toBe("success");
  expect(result.alert).toBeNull();
});

test("success after error: recovery alert", () => {
  const result = handleSyncResult(0, 500, "error");
  expect(result.logStatus).toBe("success");
  expect(result.alert).toBe("recovery");
});

test("error after success: failure alert", () => {
  const result = handleSyncResult(1, 500, "success");
  expect(result.logStatus).toBe("error");
  expect(result.alert).toBe("failure");
});

test("error after error: suppressed (no alert)", () => {
  const result = handleSyncResult(1, 500, "error");
  expect(result.logStatus).toBe("error");
  expect(result.alert).toBeNull();
});

test("first run success (no prior): no alert", () => {
  const result = handleSyncResult(0, 500, null);
  expect(result.logStatus).toBe("success");
  expect(result.alert).toBeNull();
});

test("first run error (no prior): failure alert", () => {
  const result = handleSyncResult(1, 500, null);
  expect(result.logStatus).toBe("error");
  expect(result.alert).toBe("failure");
});

test("result includes log message with duration", () => {
  const result = handleSyncResult(0, 1234, "success");
  expect(result.logMessage).toContain("1234");
});
