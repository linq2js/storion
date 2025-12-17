import { describe, it, expect } from "vitest";
import { wrapFn, unwrapFn, isWrappedFn, ORIGINAL_FN } from "./fnWrapper";

describe("fnWrapper", () => {
  describe("wrapFn", () => {
    it("should wrap a function and mark the original", () => {
      const original = (x: number) => x * 2;
      const wrapped = wrapFn(original, (fn) => {
        return (x: number) => fn(x);
      });

      expect(wrapped).not.toBe(original);
      expect((wrapped as any)[ORIGINAL_FN]).toBe(original);
    });

    it("should pass the original to the factory function", () => {
      const original = (x: number) => x * 2;
      let receivedFn: any;

      wrapFn(original, (fn) => {
        receivedFn = fn;
        return (x: number) => fn(x);
      });

      expect(receivedFn).toBe(original);
    });

    it("should preserve wrapper behavior", () => {
      const original = (x: number) => x * 2;
      const wrapped = wrapFn(original, (fn) => {
        return (x: number) => fn(x) + 1;
      });

      expect(wrapped(5)).toBe(11); // (5 * 2) + 1
    });
  });

  describe("unwrapFn", () => {
    it("should return the original function for wrapped functions", () => {
      const original = (x: number) => x * 2;
      const wrapped = wrapFn(original, (fn) => {
        return (x: number) => fn(x);
      });

      expect(unwrapFn(wrapped)).toBe(original);
    });

    it("should return the function itself if not wrapped", () => {
      const fn = (x: number) => x * 2;
      expect(unwrapFn(fn)).toBe(fn);
    });

    it("should work with manually wrapped functions", () => {
      const original = (x: number) => x * 2;
      const wrapped = (x: number) => original(x);
      (wrapped as any)[ORIGINAL_FN] = original;

      expect(unwrapFn(wrapped)).toBe(original);
    });
  });

  describe("isWrappedFn", () => {
    it("should return true for wrapped functions", () => {
      const original = (x: number) => x * 2;
      const wrapped = wrapFn(original, (fn) => (x: number) => fn(x));

      expect(isWrappedFn(wrapped)).toBe(true);
    });

    it("should return false for non-wrapped functions", () => {
      const fn = (x: number) => x * 2;
      expect(isWrappedFn(fn)).toBe(false);
    });
  });
});
