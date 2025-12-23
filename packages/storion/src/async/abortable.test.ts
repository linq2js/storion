import { describe, it, expect, vi } from "vitest";
import { abortable, isAbortable, type AbortableFn } from "./abortable";

describe("abortable", () => {
  describe("abortable()", () => {
    it("should create an abortable function", () => {
      const fn = abortable((signal, x: number) => x * 2);

      expect(typeof fn).toBe("function");
      expect(typeof fn.withSignal).toBe("function");
      expect(isAbortable(fn)).toBe(true);
    });

    it("should call function with undefined signal when called directly", () => {
      const handler = vi.fn((signal: AbortSignal | undefined, x: number) => {
        expect(signal).toBeUndefined();
        return x * 2;
      });

      const fn = abortable(handler);
      const result = fn(5);

      expect(result).toBe(10);
      expect(handler).toHaveBeenCalledWith(undefined, 5);
    });

    it("should call function with signal when using withSignal", () => {
      const controller = new AbortController();
      const handler = vi.fn(
        (signal: AbortSignal | undefined, x: number, y: string) => {
          expect(signal).toBe(controller.signal);
          return `${x}-${y}`;
        }
      );

      const fn = abortable(handler);
      const result = fn.withSignal(controller.signal, 42, "hello");

      expect(result).toBe("42-hello");
      expect(handler).toHaveBeenCalledWith(controller.signal, 42, "hello");
    });

    it("should work with async functions", async () => {
      const fn = abortable(async (signal, delay: number) => {
        await new Promise((r) => setTimeout(r, delay));
        return "done";
      });

      const result = await fn(10);
      expect(result).toBe("done");
    });

    it("should support cancellation via signal", async () => {
      const controller = new AbortController();

      const fn = abortable(async (signal, url: string) => {
        // Simulate fetch behavior
        if (signal?.aborted) {
          throw new Error("Aborted");
        }
        return `fetched: ${url}`;
      });

      controller.abort();
      await expect(fn.withSignal(controller.signal, "/api")).rejects.toThrow(
        "Aborted"
      );
    });
  });

  describe("isAbortable()", () => {
    it("should return true for abortable functions", () => {
      const fn = abortable((signal, x: number) => x);
      expect(isAbortable(fn)).toBe(true);
    });

    it("should return false for regular functions", () => {
      const fn = (x: number) => x;
      expect(isAbortable(fn)).toBe(false);
    });

    it("should return false for objects", () => {
      expect(isAbortable({})).toBe(false);
      expect(isAbortable({ withSignal: () => {} })).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isAbortable(null)).toBe(false);
      expect(isAbortable(undefined)).toBe(false);
    });
  });

  describe("type safety", () => {
    it("should preserve function argument types", () => {
      const fn = abortable(
        (signal: AbortSignal | undefined, a: number, b: string) => {
          return `${a}-${b}`;
        }
      );

      // Direct call
      const r1: string = fn(1, "test");
      expect(r1).toBe("1-test");

      // With signal
      const r2: string = fn.withSignal(undefined, 2, "hello");
      expect(r2).toBe("2-hello");
    });

    it("should preserve async return types", async () => {
      const fn = abortable(
        async (signal: AbortSignal | undefined, x: number): Promise<string> => {
          return `result-${x}`;
        }
      );

      const result: Promise<string> = fn(42);
      expect(await result).toBe("result-42");
    });
  });
});

