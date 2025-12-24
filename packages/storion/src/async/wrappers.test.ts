import { describe, it, expect, vi } from "vitest";
import { abortable } from "./abortable";
import {
  retry,
  catchError,
  timeout,
  logging,
  debounce,
  throttle,
  fallback,
  cache,
  rateLimit,
  circuitBreaker,
} from "./wrappers";

describe("wrappers", () => {
  describe("retry()", () => {
    it("should retry on failure with default retries", async () => {
      let attempts = 0;

      const fn = abortable(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("fail");
        }
        return "success";
      }).use(retry(3));

      const result = await fn();
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should fail after all retries exhausted", async () => {
      let attempts = 0;

      const fn = abortable(async () => {
        attempts++;
        throw new Error("always fail");
      }).use(retry(2));

      await expect(fn()).rejects.toThrow("always fail");
      expect(attempts).toBe(2);
    });

    it("should use custom delay", async () => {
      let attempts = 0;
      const timestamps: number[] = [];

      const fn = abortable(async () => {
        timestamps.push(Date.now());
        attempts++;
        if (attempts < 2) {
          throw new Error("fail");
        }
        return "success";
      }).use(retry({ retries: 2, delay: () => 50 }));

      await fn();
      expect(attempts).toBe(2);
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(45);
    });

    it("should use strategy name for delay", async () => {
      let attempts = 0;

      const fn = abortable(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("fail");
        }
        return "done";
      }).use(retry({ retries: 2, delay: "immediate" }));

      const result = await fn();
      expect(result).toBe("done");
      expect(attempts).toBe(2);
    });

    it("should not retry if cancelled", async () => {
      let attempts = 0;
      const controller = new AbortController();

      const fn = abortable(async ({ signal }) => {
        attempts++;
        if (signal.aborted) throw new Error("Aborted");
        throw new Error("fail");
      }).use(retry(3));

      // When parent signal is already aborted, abortable rejects immediately
      // without executing the function (correct behavior)
      controller.abort();
      await expect(fn.withSignal(controller.signal)).rejects.toThrow();
      expect(attempts).toBe(0); // Never executed because already aborted
    });

    it("should cancel delay when aborted", async () => {
      let attempts = 0;
      const controller = new AbortController();

      const fn = abortable(async () => {
        attempts++;
        throw new Error("fail");
      }).use(retry({ retries: 3, delay: 5000 })); // Long delay

      const promise = fn.withSignal(controller.signal);

      // Abort after first attempt
      setTimeout(() => controller.abort(), 50);

      const start = Date.now();
      await expect(promise).rejects.toThrow();
      const elapsed = Date.now() - start;

      // Should abort quickly, not wait for 5000ms delay
      expect(elapsed).toBeLessThan(500);
      expect(attempts).toBe(1);
    });

    it("should accept strategy name as first argument", async () => {
      let attempts = 0;

      const fn = abortable(async () => {
        attempts++;
        if (attempts < 2) throw new Error("fail");
        return "done";
      }).use(retry("immediate"));

      const result = await fn();
      expect(result).toBe("done");
      expect(attempts).toBe(2);
    });
  });

  describe("catchError()", () => {
    it("should call callback on error", async () => {
      const errorCallback = vi.fn();

      const fn = abortable(async () => {
        throw new Error("test error");
      }).use(catchError(errorCallback));

      await expect(fn()).rejects.toThrow("test error");
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("should pass args to callback", async () => {
      const errorCallback = vi.fn();

      const fn = abortable(async ({}, id: string, count: number) => {
        throw new Error("fail");
      }).use(catchError(errorCallback));

      await expect(fn("user-1", 42)).rejects.toThrow("fail");
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.anything(),
        "user-1",
        42
      );
    });

    it("should not call callback on success", async () => {
      const errorCallback = vi.fn();

      const fn = abortable(async () => "success").use(catchError(errorCallback));

      await fn();
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });

  describe("timeout()", () => {
    it("should throw if operation takes too long", async () => {
      const fn = abortable(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return "done";
      }).use(timeout(30));

      await expect(fn()).rejects.toThrow("Operation timed out");
    });

    it("should succeed if operation completes in time", async () => {
      const fn = abortable(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "success";
      }).use(timeout(100));

      const result = await fn();
      expect(result).toBe("success");
    });

    it("should use custom error message", async () => {
      const fn = abortable(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return "done";
      }).use(timeout(30, "Request took too long"));

      await expect(fn()).rejects.toThrow("Request took too long");
    });
  });

  describe("logging()", () => {
    it("should log function calls", async () => {
      const logger = {
        log: vi.fn(),
        error: vi.fn(),
      };

      const fn = abortable(async ({}, id: string) => {
        return `user-${id}`;
      }).use(logging("getUser", logger));

      await fn("123");

      expect(logger.log).toHaveBeenCalledWith(
        "[getUser] calling with:",
        ["123"]
      );
      expect(logger.log).toHaveBeenCalledWith("[getUser] success:", "user-123");
    });

    it("should log errors", async () => {
      const logger = {
        log: vi.fn(),
        error: vi.fn(),
      };

      const fn = abortable(async () => {
        throw new Error("test error");
      }).use(logging("failingFn", logger));

      await expect(fn()).rejects.toThrow("test error");

      expect(logger.log).toHaveBeenCalledWith("[failingFn] calling with:", []);
      expect(logger.error).toHaveBeenCalledWith(
        "[failingFn] error:",
        expect.any(Error)
      );
    });
  });

  describe("debounce()", () => {
    it("should only execute after delay with no new calls", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        return callCount;
      }).use(debounce(50));

      // Start multiple calls rapidly
      const p1 = fn();
      const p2 = fn();
      const p3 = fn();

      // Only the last one should execute after debounce
      const result = await p3;
      expect(callCount).toBe(1);
    });
  });

  describe("throttle()", () => {
    it("should only execute once per time window", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        return callCount;
      }).use(throttle(100));

      // First call executes
      const r1 = await fn();
      expect(r1).toBe(1);

      // Second call within window returns same result
      const r2 = await fn();
      expect(r2).toBe(1);
      expect(callCount).toBe(1);

      // Wait for throttle window to pass
      await new Promise((r) => setTimeout(r, 110));

      // Third call after window executes
      const r3 = await fn();
      expect(r3).toBe(2);
      expect(callCount).toBe(2);
    });
  });

  describe("fallback()", () => {
    it("should return fallback value on error", async () => {
      const fn = abortable(async () => {
        throw new Error("fail");
      }).use(fallback("default"));

      const result = await fn();
      expect(result).toBe("default");
    });

    it("should return null fallback on error", async () => {
      const fn = abortable(async () => {
        throw new Error("fail");
      }).use(fallback(null));

      const result = await fn();
      expect(result).toBe(null);
    });

    it("should return empty array fallback on error", async () => {
      const fn = abortable(async (): Promise<string[]> => {
        throw new Error("fail");
      }).use(fallback([] as string[]));

      const result = await fn();
      expect(result).toEqual([]);
    });

    it("should not use fallback on success", async () => {
      const fn = abortable(async () => "success").use(fallback("default"));

      const result = await fn();
      expect(result).toBe("success");
    });

    it("should support dynamic fallback function", async () => {
      const fn = abortable(async ({}, id: string) => {
        throw new Error("not found");
      }).use(fallback((error, ctx, id) => ({ error: error.message, id })));

      const result = await fn("user-123");
      expect(result).toEqual({ error: "not found", id: "user-123" });
    });

    it("should propagate abort errors (not fallback)", async () => {
      const controller = new AbortController();

      const fn = abortable(async ({ signal }) => {
        if (signal.aborted) throw new Error("Aborted");
        return "success";
      }).use(fallback("default"));

      controller.abort();
      await expect(fn.withSignal(controller.signal)).rejects.toThrow("aborted");
    });
  });

  describe("cache()", () => {
    it("should cache results for TTL duration", async () => {
      let callCount = 0;

      const fn = abortable(async ({}, id: string) => {
        callCount++;
        return `result-${id}-${callCount}`;
      }).use(cache(1000));

      const r1 = await fn("user-1");
      const r2 = await fn("user-1");

      expect(r1).toBe("result-user-1-1");
      expect(r2).toBe("result-user-1-1"); // Cached
      expect(callCount).toBe(1);
    });

    it("should cache different keys separately", async () => {
      let callCount = 0;

      const fn = abortable(async ({}, id: string) => {
        callCount++;
        return `result-${id}`;
      }).use(cache(1000));

      await fn("user-1");
      await fn("user-2");
      await fn("user-1"); // Should be cached

      expect(callCount).toBe(2);
    });

    it("should expire cache after TTL", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        return callCount;
      }).use(cache(50));

      await fn();
      expect(callCount).toBe(1);

      await new Promise((r) => setTimeout(r, 60));

      await fn();
      expect(callCount).toBe(2);
    });

    it("should use custom key function", async () => {
      let callCount = 0;

      const fn = abortable(async ({}, user: { id: string; name: string }) => {
        callCount++;
        return user.name;
      }).use(cache({ ttl: 1000, key: (user) => user.id }));

      await fn({ id: "1", name: "John" });
      await fn({ id: "1", name: "Jane" }); // Same ID, should be cached

      expect(callCount).toBe(1);
    });
  });

  describe("rateLimit()", () => {
    it("should allow calls within limit", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        return callCount;
      }).use(rateLimit({ limit: 3, window: 1000 }));

      const results = await Promise.all([fn(), fn(), fn()]);

      expect(results).toEqual([1, 2, 3]);
      expect(callCount).toBe(3);
    });

    it("should queue calls beyond limit", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        return callCount;
      }).use(rateLimit({ limit: 2, window: 50 }));

      // Start 3 calls - first 2 execute immediately, 3rd queued
      const p1 = fn();
      const p2 = fn();
      const p3 = fn();

      const r1 = await p1;
      const r2 = await p2;
      expect(r1).toBe(1);
      expect(r2).toBe(2);

      // Third should execute after window
      const r3 = await p3;
      expect(r3).toBe(3);
    });

    it("should handle abort while queued", async () => {
      const controller = new AbortController();

      const fn = abortable(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "done";
      }).use(rateLimit({ limit: 1, window: 1000 }));

      // First call takes the slot
      const p1 = fn();

      // Second call gets queued
      const p2 = fn.withSignal(controller.signal);

      // Abort the queued call
      controller.abort();

      await expect(p2).rejects.toThrow();
      expect(await p1).toBe("done");
    });
  });

  describe("circuitBreaker()", () => {
    it("should allow calls when circuit is closed", async () => {
      const fn = abortable(async () => "success").use(circuitBreaker());

      const result = await fn();
      expect(result).toBe("success");
    });

    it("should open circuit after threshold failures", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        throw new Error("fail");
      }).use(circuitBreaker({ threshold: 3 }));

      // 3 failures to trip the circuit
      await expect(fn()).rejects.toThrow("fail");
      await expect(fn()).rejects.toThrow("fail");
      await expect(fn()).rejects.toThrow("fail");

      expect(callCount).toBe(3);

      // Circuit is now open - should fail fast
      await expect(fn()).rejects.toThrow("Circuit breaker is open");
      expect(callCount).toBe(3); // No additional call
    });

    it("should transition to half-open after reset timeout", async () => {
      let callCount = 0;
      let shouldFail = true;

      const fn = abortable(async () => {
        callCount++;
        if (shouldFail) throw new Error("fail");
        return "recovered";
      }).use(circuitBreaker({ threshold: 2, resetTimeout: 50 }));

      // Trip the circuit
      await expect(fn()).rejects.toThrow("fail");
      await expect(fn()).rejects.toThrow("fail");

      // Circuit open
      await expect(fn()).rejects.toThrow("Circuit breaker is open");

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));

      // Now in half-open, allow one request
      shouldFail = false;
      const result = await fn();
      expect(result).toBe("recovered");
    });

    it("should re-open circuit if half-open test fails", async () => {
      let callCount = 0;

      const fn = abortable(async () => {
        callCount++;
        throw new Error("still broken");
      }).use(circuitBreaker({ threshold: 2, resetTimeout: 50 }));

      // Trip the circuit
      await expect(fn()).rejects.toThrow("still broken");
      await expect(fn()).rejects.toThrow("still broken");

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));

      // Half-open test fails
      await expect(fn()).rejects.toThrow("still broken");

      // Should be open again
      await expect(fn()).rejects.toThrow("Circuit breaker is open");
    });

    it("should not count aborts as failures", async () => {
      let callCount = 0;
      const controller = new AbortController();

      const fn = abortable(async ({ signal }) => {
        callCount++;
        if (signal.aborted) throw new Error("Aborted");
        return "success";
      }).use(circuitBreaker({ threshold: 2 }));

      controller.abort();

      // Aborts shouldn't count toward threshold
      await expect(fn.withSignal(controller.signal)).rejects.toThrow("aborted");
      await expect(fn.withSignal(controller.signal)).rejects.toThrow("aborted");
      await expect(fn.withSignal(controller.signal)).rejects.toThrow("aborted");

      // Circuit should still be closed
      const freshController = new AbortController();
      const result = await fn.withSignal(freshController.signal);
      expect(result).toBe("success");
    });

    it("should decrement failure count on success", async () => {
      let shouldFail = true;

      const fn = abortable(async () => {
        if (shouldFail) throw new Error("fail");
        return "success";
      }).use(circuitBreaker({ threshold: 3 }));

      // 2 failures (failures = 2)
      await expect(fn()).rejects.toThrow("fail");
      await expect(fn()).rejects.toThrow("fail");

      // Success - decrements (failures = 1)
      shouldFail = false;
      await fn();

      // 1 more failure (failures = 2, still under threshold)
      shouldFail = true;
      await expect(fn()).rejects.toThrow("fail");

      // Another success - decrements (failures = 1)
      shouldFail = false;
      await fn();

      // 1 more failure - should still be under threshold (failures = 2)
      shouldFail = true;
      await expect(fn()).rejects.toThrow("fail");

      // Circuit should still be closed
      shouldFail = false;
      const result = await fn();
      expect(result).toBe("success");
    });
  });

  describe("chaining wrappers", () => {
    it("should chain multiple wrappers", async () => {
      let attempts = 0;
      const errors: Error[] = [];

      const fn = abortable(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error(`fail-${attempts}`);
        }
        return "success";
      })
        .use(catchError((e) => errors.push(e)))
        .use(retry(3));

      const result = await fn();
      expect(result).toBe("success");
      expect(attempts).toBe(2);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("fail-1");
    });

    it("should apply wrappers in correct order", async () => {
      const order: string[] = [];

      const fn = abortable(async () => {
        order.push("base");
        return "done";
      })
        .use((next) => async (ctx) => {
          order.push("wrapper1-before");
          const result = await next(ctx);
          order.push("wrapper1-after");
          return result;
        })
        .use((next) => async (ctx) => {
          order.push("wrapper2-before");
          const result = await next(ctx);
          order.push("wrapper2-after");
          return result;
        });

      await fn();

      expect(order).toEqual([
        "wrapper2-before",
        "wrapper1-before",
        "base",
        "wrapper1-after",
        "wrapper2-after",
      ]);
    });

    it("should compose fallback with retry", async () => {
      let attempts = 0;

      const fn = abortable(async () => {
        attempts++;
        throw new Error("fail");
      })
        .use(retry(2))
        .use(fallback("default"));

      const result = await fn();
      expect(result).toBe("default");
      expect(attempts).toBe(2); // Retried, then fallback
    });

    it("should compose cache with circuit breaker", async () => {
      let callCount = 0;

      const fn = abortable(async ({}, id: string) => {
        callCount++;
        return `result-${id}`;
      })
        .use(cache(1000))
        .use(circuitBreaker());

      await fn("1");
      await fn("1"); // Cached
      await fn("2");
      await fn("1"); // Still cached

      expect(callCount).toBe(2); // Only 2 actual calls
    });
  });

  describe("TYield preservation", () => {
    it("should preserve TYield type through wrapper chain (compile-time check)", async () => {
      type Events = { step: number };

      const workflow = abortable<[], string, Events>(async ({ take }) => {
        const step1 = await take("step");
        return `completed: ${step1}`;
      });

      // Apply wrappers - TYield type should be preserved
      const wrappedWorkflow = workflow.use(retry(2));

      // Type check: result should have send() with correct signature
      const result = wrappedWorkflow();

      // This should compile - send() should accept "step" with number
      // @ts-expect-error - "invalid" is not a valid event key
      result.send("invalid", 10);

      // Abort and catch to clean up
      result.abort();
      await result.catch(() => {});
    });

    it("should preserve TYield through multiple wrappers", async () => {
      type MyEvents = { data: string; done: boolean };

      const fn = abortable<[string], number, MyEvents>(async ({ take }, id) => {
        const data = await take("data");
        const done = await take("done");
        return done ? data.length : 0;
      });

      // Chain multiple wrappers
      const wrapped = fn.use(retry(3)).use(catchError(() => {}));

      const result = wrapped("test-id");

      // Type check: send signature should match MyEvents
      // @ts-expect-error - wrong value type for "data" event
      result.send("data", 123);

      // Abort and catch to clean up
      result.abort();
      await result.catch(() => {});
    });
  });
});

