import { test, expect, vi } from "vitest";
import { withRetry } from "./mailer";

test("withRetry returns result on first success", async () => {
  const fn = vi.fn().mockResolvedValue("ok");
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(1);
});

test("withRetry retries on failure then returns success", async () => {
  const fn = vi.fn()
    .mockRejectedValueOnce(new Error("fail1"))
    .mockResolvedValue("ok");
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);
});

test("withRetry throws after all attempts exhausted", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("persistent"));
  await expect(withRetry(fn, 3, 0)).rejects.toThrow("persistent");
  expect(fn).toHaveBeenCalledTimes(3);
});
