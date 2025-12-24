import { describe, it, expect, vi } from "vitest";
import {
  abortable,
  isAbortable,
  AbortableAbortedError,
  type AbortableContext,
} from "./abortable";

describe("abortable", () => {
  describe("abortable()", () => {
    it("should create an abortable function", () => {
      const fn = abortable(({}, x: number) => Promise.resolve(x * 2));

      expect(typeof fn).toBe("function");
      expect(typeof fn.withSignal).toBe("function");
      expect(typeof fn.use).toBe("function");
      expect(isAbortable(fn)).toBe(true);
    });

    it("should create AbortController when called directly", async () => {
      const handler = vi.fn(({ signal }: AbortableContext, x: number) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve(x * 2);
      });

      const fn = abortable(handler);
      const result = await fn(5);

      expect(result).toBe(10);
      expect(handler).toHaveBeenCalled();
    });

    it("should create own signal when using withSignal() - linked to parent", async () => {
      const controller = new AbortController();
      const handler = vi.fn(
        ({ signal }: AbortableContext, x: number, y: string) => {
          // Signal is NOT the same as parent - abortable owns its own signal
          expect(signal).toBeDefined();
          expect(signal).toBeInstanceOf(AbortSignal);
          expect(signal).not.toBe(controller.signal);
          return Promise.resolve(`${x}-${y}`);
        }
      );

      const fn = abortable(handler);
      const result = await fn.withSignal(controller.signal, 42, "hello");

      expect(result).toBe("42-hello");
      expect(handler).toHaveBeenCalled();
    });

    it("should work with async functions", async () => {
      const fn = abortable(async ({}, delay: number) => {
        await new Promise((r) => setTimeout(r, delay));
        return "done";
      });

      const result = await fn(10);
      expect(result).toBe("done");
    });

    it("should abort when parent signal aborts", async () => {
      const controller = new AbortController();

      const fn = abortable(async ({ signal }, url: string) => {
        // Wait a bit to allow abort to propagate
        await new Promise((r) => setTimeout(r, 10));
        if (signal.aborted) {
          throw new AbortableAbortedError();
        }
        return `fetched: ${url}`;
      });

      controller.abort();
      await expect(fn.withSignal(controller.signal, "/api")).rejects.toThrow(
        AbortableAbortedError
      );
    });

    it("should provide safe() in context", async () => {
      const innerFn = abortable(async ({ signal }, value: string) => {
        return `inner-${value}`;
      });

      const outerFn = abortable(async ({ safe }, value: string) => {
        // Use safe to call another abortable function
        const innerResult = await safe(innerFn, "test");
        return `outer-${value}-${innerResult}`;
      });

      const result = await outerFn("hello");
      expect(result).toBe("outer-hello-inner-test");
    });

    it("should create new AbortController when withSignal() receives undefined", async () => {
      const handler = vi.fn(({ signal }: AbortableContext) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve("ok");
      });

      const fn = abortable(handler);
      await fn.withSignal(undefined);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe("AbortableResult control methods", () => {
    it("should return AbortableResult with status methods", async () => {
      const fn = abortable(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "done";
      });

      const result = fn();

      expect(typeof result.status).toBe("function");
      expect(typeof result.running).toBe("function");
      expect(typeof result.succeeded).toBe("function");
      expect(typeof result.failed).toBe("function");
      expect(typeof result.aborted).toBe("function");
      expect(typeof result.paused).toBe("function");
      expect(typeof result.waiting).toBe("function");
      expect(typeof result.completed).toBe("function");

      await result;
      expect(result.succeeded()).toBe(true);
      expect(result.status()).toBe("success");
    });

    it("should support abort() method", async () => {
      const fn = abortable(async ({ signal }) => {
        await new Promise((r) => setTimeout(r, 100));
        if (signal.aborted) {
          throw new AbortableAbortedError();
        }
        return "done";
      });

      const result = fn();
      expect(result.abort()).toBe(true);
      expect(result.abort()).toBe(false); // Already aborted

      await expect(result).rejects.toThrow(AbortableAbortedError);
      expect(result.aborted()).toBe(true);
      expect(result.status()).toBe("aborted");
    });

    it("should support pause() and resume() methods", async () => {
      let step = 0;
      let checkpointReached = false;

      // Pause works at checkpoint() - a manual suspension point
      const fn = abortable(async (ctx) => {
        step = 1;
        // This simulates waiting for something
        await new Promise((r) => setTimeout(r, 20));
        // Then hitting a checkpoint where pause is checked
        await ctx.checkpoint();
        checkpointReached = true;
        step = 2;
        return "done";
      });

      const result = fn();

      // Immediately pause before checkpoint is reached
      result.pause();
      expect(result.paused()).toBe(true);

      // Wait long enough for the setTimeout to complete
      // but checkpoint should block because paused
      await new Promise((r) => setTimeout(r, 50));
      expect(checkpointReached).toBe(false);
      expect(step).toBe(1);

      // Resume - now checkpoint will pass
      result.resume();

      await result;
      expect(checkpointReached).toBe(true);
      expect(step).toBe(2);
      expect(result.succeeded()).toBe(true);
    });

    it("should support send() for events", async () => {
      const fn = abortable<[], string, { confirm: boolean }>(async (ctx) => {
        const confirmed = await ctx.take("confirm");
        return confirmed ? "yes" : "no";
      });

      const result = fn();

      // Should be waiting
      await new Promise((r) => setTimeout(r, 10));
      expect(result.waiting()).toBe(true);

      // Send event
      result.send("confirm", true);

      const value = await result;
      expect(value).toBe("yes");
    });

    it("should support checkpoint pattern (TYield = void)", async () => {
      const steps: string[] = [];

      const fn = abortable(async (ctx) => {
        steps.push("step1");
        await ctx.take();
        steps.push("step2");
        await ctx.take();
        steps.push("step3");
        return "done";
      });

      const result = fn();

      await new Promise((r) => setTimeout(r, 10));
      expect(steps).toEqual(["step1"]);

      result.send();
      await new Promise((r) => setTimeout(r, 10));
      expect(steps).toEqual(["step1", "step2"]);

      result.send();
      await result;
      expect(steps).toEqual(["step1", "step2", "step3"]);
    });

    it("should provide result() and error() accessors", async () => {
      const successFn = abortable(async () => "success");
      const errorFn = abortable(async () => {
        throw new Error("test error");
      });

      const successResult = successFn();
      await successResult;
      expect(successResult.result()).toBe("success");
      expect(successResult.error()).toBeUndefined();

      const errorResult = errorFn();
      await expect(errorResult).rejects.toThrow("test error");
      expect(errorResult.result()).toBeUndefined();
      expect(errorResult.error()).toBeInstanceOf(Error);
    });
  });

  describe("use() - chainable wrappers", () => {
    it("should apply a wrapper and return new Abortable", async () => {
      const baseFn = abortable(async ({ signal }, x: number) => {
        return x * 2;
      });

      // Create a wrapper that adds 10 to the result
      const wrappedFn = baseFn.use((next) => async (ctx, x: number) => {
        const result = await next(ctx, x);
        return result + 10;
      });

      expect(isAbortable(wrappedFn)).toBe(true);

      const result = await wrappedFn(5);
      expect(result).toBe(20); // (5 * 2) + 10
    });

    it("should support chaining multiple wrappers", async () => {
      const baseFn = abortable(async ({ signal }, x: number) => {
        return x;
      });

      const wrappedFn = baseFn
        .use((next) => async (ctx, x: number) => {
          const result = await next(ctx, x);
          return result * 2;
        })
        .use((next) => async (ctx, x: number) => {
          const result = await next(ctx, x);
          return result + 10;
        });

      // Order: base(5) = 5, then *2 = 10, then +10 = 20
      const result = await wrappedFn(5);
      expect(result).toBe(20);
    });

    it("should provide consistent context through wrappers", async () => {
      const signalCaptures: AbortSignal[] = [];

      const baseFn = abortable(async ({ signal }, x: number) => {
        signalCaptures.push(signal);
        return x;
      });

      const wrappedFn = baseFn.use((next) => async (ctx, x: number) => {
        signalCaptures.push(ctx.signal);
        return next(ctx, x);
      });

      await wrappedFn(5);

      // Both wrapper and base should see signals (may be different due to wrapping)
      expect(signalCaptures).toHaveLength(2);
      expect(signalCaptures[0]).toBeInstanceOf(AbortSignal);
      expect(signalCaptures[1]).toBeInstanceOf(AbortSignal);
    });

    it("should allow transforming arguments", async () => {
      // Base function takes a number
      const baseFn = abortable(async ({}, x: number) => {
        return x * 2;
      });

      // Wrapper transforms string to number
      const wrappedFn = baseFn.use((next) => async (ctx, str: string) => {
        const num = parseInt(str, 10);
        return next(ctx, num);
      });

      const result = await wrappedFn("42");
      expect(result).toBe(84);
    });

    it("should allow retry wrapper pattern", async () => {
      let callCount = 0;

      const flaky = abortable(async ({}) => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Flaky error");
        }
        return "success";
      });

      // Simple retry wrapper
      const withRetry = flaky.use((next) => async (ctx) => {
        let lastError: Error;
        for (let i = 0; i < 3; i++) {
          try {
            return await next(ctx);
          } catch (e) {
            lastError = e as Error;
          }
        }
        throw lastError!;
      });

      const result = await withRetry();
      expect(result).toBe("success");
      expect(callCount).toBe(3);
    });
  });

  describe("isAbortable()", () => {
    it("should return true for abortable functions", () => {
      const fn = abortable(({ signal }, x: number) => Promise.resolve(x));
      expect(isAbortable(fn)).toBe(true);
    });

    it("should return false for regular functions", () => {
      const fn = (x: number) => x;
      expect(isAbortable(fn)).toBe(false);
    });

    it("should return false for objects", () => {
      expect(isAbortable({})).toBe(false);
      expect(isAbortable({ with: () => {} })).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isAbortable(null)).toBe(false);
      expect(isAbortable(undefined)).toBe(false);
    });
  });

  describe("type safety", () => {
    it("should preserve function argument types", async () => {
      const fn = abortable(
        ({ signal }: AbortableContext, a: number, b: string) => {
          return Promise.resolve(`${a}-${b}`);
        }
      );

      // Direct call
      const r1: string = await fn(1, "test");
      expect(r1).toBe("1-test");

      // With signal
      const r2: string = await fn.withSignal(undefined, 2, "hello");
      expect(r2).toBe("2-hello");
    });

    it("should preserve async return types", async () => {
      const fn = abortable(
        async ({ signal }: AbortableContext, x: number): Promise<string> => {
          return `result-${x}`;
        }
      );

      const result: Promise<string> = fn(42);
      expect(await result).toBe("result-42");
    });
  });

  describe("AbortableContext", () => {
    it("should provide aborted() method", async () => {
      let wasAborted = false;

      // Use take() to create a suspension point where we can abort
      const fn = abortable<[], string, { continue: void }>(async (ctx) => {
        await ctx.take("continue");
        wasAborted = ctx.aborted();
        if (wasAborted) {
          throw new AbortableAbortedError();
        }
        return "done";
      });

      const result = fn();

      // Wait for take to be reached
      await new Promise((r) => setTimeout(r, 10));
      expect(result.waiting()).toBe(true);

      // Abort while waiting
      result.abort();
      expect(result.aborted()).toBe(true);

      // The promise should reject
      await expect(result).rejects.toThrow(AbortableAbortedError);
    });

    it("should provide abort() method from inside", async () => {
      const fn = abortable<[], string, { continue: void }>(async (ctx) => {
        ctx.abort();
        // Try to take - should see we're aborted
        try {
          await ctx.take("continue");
        } catch (e) {
          if (ctx.aborted()) {
            throw new AbortableAbortedError();
          }
          throw e;
        }
        return "done";
      });

      const result = fn();
      await expect(result).rejects.toThrow(AbortableAbortedError);
      expect(result.aborted()).toBe(true);
    });

    it("should provide checkpoint() that checks abort status", async () => {
      let checkpointPassed = false;

      const fn = abortable(async (ctx) => {
        // Abort immediately
        ctx.abort();
        // Checkpoint should throw because aborted
        await ctx.checkpoint();
        checkpointPassed = true;
        return "done";
      });

      const result = fn();
      await expect(result).rejects.toThrow(AbortableAbortedError);
      expect(checkpointPassed).toBe(false);
    });
  });
});
