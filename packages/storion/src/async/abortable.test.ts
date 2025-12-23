import { describe, it, expect, vi } from "vitest";
import { abortable, isAbortable, type AbortableContext } from "./abortable";

describe("abortable", () => {
  describe("abortable()", () => {
    it("should create an abortable function", () => {
      const fn = abortable(({}, x: number) => Promise.resolve(x * 2));

      expect(typeof fn).toBe("function");
      expect(typeof fn.with).toBe("function");
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

    it("should call function with provided signal when using with()", async () => {
      const controller = new AbortController();
      const handler = vi.fn(
        ({ signal }: AbortableContext, x: number, y: string) => {
          expect(signal).toBe(controller.signal);
          return Promise.resolve(`${x}-${y}`);
        }
      );

      const fn = abortable(handler);
      const result = await fn.with(controller.signal, 42, "hello");

      expect(result).toBe("42-hello");
      expect(handler).toHaveBeenCalled();
    });

    it("should work with async functions", async () => {
      const fn = abortable(async ({ signal }, delay: number) => {
        await new Promise((r) => setTimeout(r, delay));
        return "done";
      });

      const result = await fn(10);
      expect(result).toBe("done");
    });

    it("should support cancellation via signal", async () => {
      const controller = new AbortController();

      const fn = abortable(async ({ signal }, url: string) => {
        // Simulate fetch behavior
        if (signal?.aborted) {
          throw new Error("Aborted");
        }
        return `fetched: ${url}`;
      });

      controller.abort();
      await expect(fn.with(controller.signal, "/api")).rejects.toThrow(
        "Aborted"
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

    it("should create new AbortController when with() receives undefined", async () => {
      const handler = vi.fn(({ signal }: AbortableContext) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
        return Promise.resolve("ok");
      });

      const fn = abortable(handler);
      await fn.with(undefined);

      expect(handler).toHaveBeenCalled();
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

    it("should preserve signal through wrappers", async () => {
      const controller = new AbortController();
      const signalCaptures: AbortSignal[] = [];

      const baseFn = abortable(async ({ signal }, x: number) => {
        signalCaptures.push(signal);
        return x;
      });

      const wrappedFn = baseFn.use((next) => async (ctx, x: number) => {
        signalCaptures.push(ctx.signal);
        return next(ctx, x);
      });

      await wrappedFn.with(controller.signal, 5);

      // Both wrapper and base should see the same signal
      expect(signalCaptures).toHaveLength(2);
      expect(signalCaptures[0]).toBe(controller.signal);
      expect(signalCaptures[1]).toBe(controller.signal);
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
      const r2: string = await fn.with(undefined, 2, "hello");
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
});
