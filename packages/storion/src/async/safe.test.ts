import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSafe, isPromiseLike, type SafeFnWithUtils } from "./safe";
import { toPromise } from "./async";

describe("isPromiseLike", () => {
  it("should return true for native Promise", () => {
    expect(isPromiseLike(Promise.resolve(1))).toBe(true);
  });

  it("should return true for thenable objects", () => {
    const thenable = { then: () => {} };
    expect(isPromiseLike(thenable)).toBe(true);
  });

  it("should return false for non-promise values", () => {
    expect(isPromiseLike(42)).toBe(false);
    expect(isPromiseLike("string")).toBe(false);
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(undefined)).toBe(false);
    expect(isPromiseLike({})).toBe(false);
    expect(isPromiseLike({ then: "not a function" })).toBe(false);
  });

  it("should return false for functions", () => {
    expect(isPromiseLike(() => {})).toBe(false);
  });
});

describe("toPromise", () => {
  it("should wrap sync value in Promise", async () => {
    const result = await toPromise(42);
    expect(result).toBe(42);
  });

  it("should return Promise as-is (normalized)", async () => {
    const promise = Promise.resolve("hello");
    const result = await toPromise(promise);
    expect(result).toBe("hello");
  });

  it("should invoke parameterless function and wrap result", async () => {
    const fn = () => 42;
    const result = await toPromise(fn);
    expect(result).toBe(42);
  });

  it("should invoke function returning Promise", async () => {
    const fn = () => Promise.resolve("async");
    const result = await toPromise(fn);
    expect(result).toBe("async");
  });

  it("should handle nested functions", async () => {
    const fn = () => () => 42;
    const result = await toPromise(fn);
    expect(result).toBe(42);
  });

  it("should handle thenable objects", async () => {
    const thenable = {
      then: (resolve: (v: number) => void) => resolve(99),
    };
    const result = await toPromise(thenable);
    expect(result).toBe(99);
  });

  it("should reject if function throws", async () => {
    const fn = () => {
      throw new Error("oops");
    };
    await expect(toPromise(fn)).rejects.toThrow("oops");
  });

  it("should reject if function returns rejected Promise", async () => {
    const fn = () => Promise.reject(new Error("async error"));
    await expect(toPromise(fn)).rejects.toThrow("async error");
  });
});

describe("createSafe", () => {
  let cancelled: boolean;
  let safe: SafeFnWithUtils;

  beforeEach(() => {
    cancelled = false;
    safe = createSafe(
      () => undefined,
      () => cancelled
    );
  });

  describe("safe()", () => {
    it("should resolve promise if not cancelled", async () => {
      const result = await safe(Promise.resolve(42));
      expect(result).toBe(42);
    });

    it("should never resolve if cancelled before call", async () => {
      cancelled = true;
      let resolved = false;
      safe(Promise.resolve(42)).then(() => {
        resolved = true;
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);
    });

    it("should never resolve if cancelled during promise", async () => {
      let resolved = false;
      const promise = new Promise<number>((resolve) => {
        setTimeout(() => resolve(42), 50);
      });

      safe(promise).then(() => {
        resolved = true;
      });

      // Cancel before promise resolves
      cancelled = true;
      await new Promise((r) => setTimeout(r, 100));
      expect(resolved).toBe(false);
    });

    it("should call function and wrap result", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      const result = await safe(fn, "arg1", "arg2");
      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
      expect(result).toBe("result");
    });
  });

  describe("safe.all", () => {
    describe("array syntax", () => {
      it("should resolve all promises", async () => {
        const result = await safe.all([
          Promise.resolve(1),
          Promise.resolve("two"),
          Promise.resolve(true),
        ]);
        expect(result).toEqual([1, "two", true]);
      });

      it("should invoke functions", async () => {
        const fn1 = vi.fn().mockReturnValue(1);
        const fn2 = vi.fn().mockResolvedValue(2);

        const result = await safe.all([fn1, fn2]);
        expect(fn1).toHaveBeenCalled();
        expect(fn2).toHaveBeenCalled();
        expect(result).toEqual([1, 2]);
      });

      it("should handle mixed inputs", async () => {
        const result = await safe.all([
          42,
          Promise.resolve("hello"),
          () => true,
          () => Promise.resolve([1, 2, 3]),
        ]);
        expect(result).toEqual([42, "hello", true, [1, 2, 3]]);
      });

      it("should never resolve if cancelled", async () => {
        cancelled = true;
        let resolved = false;
        safe.all([Promise.resolve(1)]).then(() => {
          resolved = true;
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(resolved).toBe(false);
      });

      it("should reject if any promise rejects", async () => {
        await expect(
          safe.all([Promise.resolve(1), Promise.reject(new Error("fail"))])
        ).rejects.toThrow("fail");
      });
    });

    describe("object syntax", () => {
      it("should resolve all promises with keys", async () => {
        const result = await safe.all({
          a: Promise.resolve(1),
          b: Promise.resolve("two"),
        });
        expect(result).toEqual({ a: 1, b: "two" });
      });

      it("should invoke functions", async () => {
        const result = await safe.all({
          sync: () => 42,
          async: () => Promise.resolve("hello"),
        });
        expect(result).toEqual({ sync: 42, async: "hello" });
      });

      it("should handle mixed inputs", async () => {
        const result = await safe.all({
          value: 1,
          promise: Promise.resolve(2),
          syncFn: () => 3,
          asyncFn: () => Promise.resolve(4),
        });
        expect(result).toEqual({ value: 1, promise: 2, syncFn: 3, asyncFn: 4 });
      });
    });
  });

  describe("safe.race", () => {
    describe("array syntax", () => {
      it("should return first resolved value", async () => {
        const fast = Promise.resolve("fast");
        const slow = new Promise((r) => setTimeout(() => r("slow"), 100));

        const result = await safe.race([slow, fast]);
        expect(result).toBe("fast");
      });

      it("should invoke functions", async () => {
        const result = await safe.race([
          () => new Promise((r) => setTimeout(() => r("slow"), 100)),
          () => "fast",
        ]);
        expect(result).toBe("fast");
      });

      it("should never resolve if cancelled", async () => {
        cancelled = true;
        let resolved = false;
        safe.race([Promise.resolve(1)]).then(() => {
          resolved = true;
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(resolved).toBe(false);
      });
    });

    describe("object syntax", () => {
      it("should return [key, value] tuple for winner", async () => {
        const fast = Promise.resolve("fast-value");
        const slow = new Promise((r) => setTimeout(() => r("slow-value"), 100));

        const result = await safe.race({
          slow,
          fast,
        });
        expect(result).toEqual(["fast", "fast-value"]);
      });

      it("should invoke functions", async () => {
        const result = await safe.race({
          slow: () => new Promise((r) => setTimeout(() => r("slow"), 100)),
          fast: () => "fast-value",
        });
        expect(result).toEqual(["fast", "fast-value"]);
      });
    });
  });

  describe("safe.settled", () => {
    describe("array syntax", () => {
      it("should return all settled results", async () => {
        const result = await safe.settled([
          Promise.resolve(1),
          Promise.reject(new Error("fail")),
          Promise.resolve(3),
        ]);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ status: "fulfilled", value: 1 });
        expect(result[1]).toEqual({
          status: "rejected",
          reason: expect.any(Error),
        });
        expect(result[2]).toEqual({ status: "fulfilled", value: 3 });
      });

      it("should invoke functions", async () => {
        const result = await safe.settled([
          () => 42,
          () => Promise.reject(new Error("oops")),
        ]);

        expect(result[0]).toEqual({ status: "fulfilled", value: 42 });
        expect(result[1]).toEqual({
          status: "rejected",
          reason: expect.any(Error),
        });
      });

      it("should never resolve if cancelled", async () => {
        cancelled = true;
        let resolved = false;
        safe.settled([Promise.resolve(1)]).then(() => {
          resolved = true;
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(resolved).toBe(false);
      });
    });

    describe("object syntax", () => {
      it("should return object with settled results", async () => {
        const result = await safe.settled({
          success: Promise.resolve("ok"),
          fail: Promise.reject(new Error("error")),
        });

        expect(result.success).toEqual({ status: "fulfilled", value: "ok" });
        expect(result.fail).toEqual({
          status: "rejected",
          reason: expect.any(Error),
        });
      });
    });
  });

  describe("safe.any", () => {
    describe("array syntax", () => {
      it("should return first successful result", async () => {
        const result = await safe.any([
          Promise.reject(new Error("fail1")),
          Promise.resolve("success"),
          Promise.reject(new Error("fail2")),
        ]);
        expect(result).toBe("success");
      });

      it("should invoke functions", async () => {
        const result = await safe.any([
          () => Promise.reject(new Error("fail")),
          () => "success",
        ]);
        expect(result).toBe("success");
      });

      it("should throw AggregateError if all fail", async () => {
        await expect(
          safe.any([
            Promise.reject(new Error("fail1")),
            Promise.reject(new Error("fail2")),
          ])
        ).rejects.toMatchObject({ name: "AggregateError" });
      });

      it("should never resolve if cancelled", async () => {
        cancelled = true;
        let resolved = false;
        safe.any([Promise.resolve(1)]).then(() => {
          resolved = true;
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(resolved).toBe(false);
      });
    });

    describe("object syntax", () => {
      it("should return [key, value] tuple for first success", async () => {
        const result = await safe.any({
          fail: Promise.reject(new Error("fail")),
          success: Promise.resolve("ok"),
        });
        expect(result).toEqual(["success", "ok"]);
      });

      it("should invoke functions", async () => {
        const result = await safe.any({
          fail: () => Promise.reject(new Error("fail")),
          success: () => "ok",
        });
        expect(result).toEqual(["success", "ok"]);
      });
    });
  });

  describe("cancellation during execution", () => {
    it("safe.all should not resolve if cancelled during execution", async () => {
      let resolved = false;

      const slowPromise = new Promise<number>((resolve) => {
        setTimeout(() => resolve(42), 50);
      });

      safe.all([slowPromise]).then(() => {
        resolved = true;
      });

      // Cancel while promises are pending
      cancelled = true;
      await new Promise((r) => setTimeout(r, 100));

      expect(resolved).toBe(false);
    });

    it("safe.race should not resolve if cancelled during execution", async () => {
      let resolved = false;

      const slowPromise = new Promise<number>((resolve) => {
        setTimeout(() => resolve(42), 50);
      });

      safe.race([slowPromise]).then(() => {
        resolved = true;
      });

      cancelled = true;
      await new Promise((r) => setTimeout(r, 100));

      expect(resolved).toBe(false);
    });
  });

  describe("safe.callback", () => {
    it("should execute callback if not cancelled", () => {
      const fn = vi.fn();
      const wrapped = safe.callback(fn);

      wrapped("arg1", "arg2");

      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should not execute callback if cancelled", () => {
      const fn = vi.fn();
      const wrapped = safe.callback(fn);

      cancelled = true;
      wrapped("arg1", "arg2");

      expect(fn).not.toHaveBeenCalled();
    });

    it("should respect cancellation state at call time", () => {
      const fn = vi.fn();
      const wrapped = safe.callback(fn);

      // First call - not cancelled
      wrapped();
      expect(fn).toHaveBeenCalledTimes(1);

      // Cancel
      cancelled = true;

      // Second call - cancelled
      wrapped();
      expect(fn).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it("should work as event handler", () => {
      const handler = vi.fn();
      const safeHandler = safe.callback(handler);

      // Simulate event
      const event = { type: "click" };
      safeHandler(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should pass through all arguments", () => {
      const fn = vi.fn();
      const wrapped = safe.callback(fn);

      wrapped(1, "two", { three: 3 }, [4]);

      expect(fn).toHaveBeenCalledWith(1, "two", { three: 3 }, [4]);
    });
  });

  describe("safe.delay", () => {
    it("should resolve after specified time", async () => {
      vi.useFakeTimers();

      let resolved = false;
      safe.delay(100).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      expect(resolved).toBe(true);

      vi.useRealTimers();
    });

    it("should resolve with provided value", async () => {
      vi.useFakeTimers();

      const promise = safe.delay(100, "done");

      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe("done");

      vi.useRealTimers();
    });

    it("should never resolve if cancelled before delay", async () => {
      vi.useFakeTimers();

      cancelled = true;

      let resolved = false;
      safe.delay(100).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(200);
      expect(resolved).toBe(false);

      vi.useRealTimers();
    });

    it("should never resolve if cancelled during delay", async () => {
      vi.useFakeTimers();

      let resolved = false;
      safe.delay(100).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(50);
      cancelled = true;

      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      vi.useRealTimers();
    });

    it("should resolve with undefined if no value provided", async () => {
      vi.useFakeTimers();

      const promise = safe.delay(50);
      await vi.advanceTimersByTimeAsync(50);

      const result = await promise;
      expect(result).toBe(undefined);

      vi.useRealTimers();
    });
  });
});
