import { describe, expect, it, vi } from "vitest";
import { retry, withTimeout } from "./retry.js";

const never = () => new Promise(() => {});

describe("withTimeout", () => {
  it("passes a result through", async () => {
    await expect(withTimeout(Promise.resolve(5), 50)).resolves.toBe(5);
  });

  it("rejects with a TimeoutError when nothing comes back", async () => {
    await expect(withTimeout(never(), 10)).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("calls onTimeout only when time runs out", async () => {
    const onTimeout = vi.fn();
    await withTimeout(Promise.resolve(1), 50, onTimeout);
    expect(onTimeout).not.toHaveBeenCalled();
    await expect(withTimeout(never(), 10, onTimeout)).rejects.toThrow();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe("retry", () => {
  it("returns the first success", async () => {
    const step = vi.fn().mockResolvedValue("ok");
    await expect(retry(step, { backoffMs: 0 })).resolves.toBe("ok");
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("tries again after a request that never answers", async () => {
    const step = vi.fn().mockImplementationOnce(never).mockResolvedValue("ok");
    await expect(retry(step, { ms: 10, backoffMs: 0 })).resolves.toBe("ok");
    expect(step).toHaveBeenCalledTimes(2);
  });

  it("tries again after an error", async () => {
    const step = vi.fn().mockRejectedValueOnce(new Error("57014")).mockResolvedValue("ok");
    await expect(retry(step, { backoffMs: 0 })).resolves.toBe("ok");
  });

  it("cancels a try that ran out of time before starting the next", async () => {
    const signals = [];
    const step = vi
      .fn()
      .mockImplementationOnce((signal) => (signals.push(signal), never()))
      .mockImplementation((signal) => (signals.push(signal), Promise.resolve("ok")));
    await expect(retry(step, { ms: 10, backoffMs: 0 })).resolves.toBe("ok");
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
  });

  it("stops at once on an error retryIf says won't change", async () => {
    const missing = Object.assign(new Error("no such view"), { code: "PGRST205" });
    const step = vi.fn().mockRejectedValue(missing);
    const retryIf = (e) => e.code !== "PGRST205";
    await expect(retry(step, { backoffMs: 0, retryIf })).rejects.toBe(missing);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("gives up after `tries` and rejects with the last error", async () => {
    const step = vi.fn().mockImplementation(never);
    await expect(retry(step, { tries: 2, ms: 10, backoffMs: 0 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(step).toHaveBeenCalledTimes(2);
  });
});
