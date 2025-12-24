import { describe, it, expect } from "vitest";
import {
  strictEqual,
  shallowEqual,
  shallow2Equal,
  shallow3Equal,
  deepEqual,
  resolveEquality,
  equality,
} from "./equality";

describe("equality", () => {
  describe("strictEqual", () => {
    it("should return true for identical primitives", () => {
      expect(strictEqual(1, 1)).toBe(true);
      expect(strictEqual("a", "a")).toBe(true);
      expect(strictEqual(true, true)).toBe(true);
    });

    it("should return false for different values", () => {
      expect(strictEqual(1, 2)).toBe(false);
      expect(strictEqual("a", "b")).toBe(false);
    });

    it("should return false for different object references", () => {
      expect(strictEqual({}, {})).toBe(false);
      expect(strictEqual([], [])).toBe(false);
    });

    it("should return true for same object reference", () => {
      const obj = { a: 1 };
      expect(strictEqual(obj, obj)).toBe(true);
    });
  });

  describe("shallowEqual", () => {
    it("should return true for equal primitives", () => {
      expect(shallowEqual(1, 1)).toBe(true);
      expect(shallowEqual("a", "a")).toBe(true);
    });

    it("should return true for shallow equal objects", () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it("should return true for shallow equal arrays", () => {
      expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it("should return false for different nested objects", () => {
      expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
    });
  });

  describe("shallow2Equal", () => {
    it("should return true for 2-level equal objects", () => {
      const inner = { value: 1 };
      expect(shallow2Equal({ a: inner }, { a: inner })).toBe(true);
    });

    it("should return true for 2-level equal arrays", () => {
      expect(shallow2Equal([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
    });

    it("should return true for object with nested shallow equal objects", () => {
      expect(
        shallow2Equal({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 2 } })
      ).toBe(true);
    });

    it("should return false for 3-level nested differences", () => {
      expect(
        shallow2Equal({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })
      ).toBe(false);
    });
  });

  describe("shallow3Equal", () => {
    it("should return true for 3-level equal objects", () => {
      expect(
        shallow3Equal({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })
      ).toBe(true);
    });

    it("should return true for deeply nested arrays", () => {
      expect(
        shallow3Equal([[[1, 2]], [[3, 4]]], [[[1, 2]], [[3, 4]]])
      ).toBe(true);
    });

    it("should return false for 4-level nested differences", () => {
      expect(
        shallow3Equal(
          { a: { b: { c: { d: 1 } } } },
          { a: { b: { c: { d: 1 } } } }
        )
      ).toBe(false);
    });
  });

  describe("deepEqual", () => {
    it("should return true for deeply equal objects", () => {
      expect(
        deepEqual(
          { a: { b: { c: { d: 1 } } } },
          { a: { b: { c: { d: 1 } } } }
        )
      ).toBe(true);
    });

    it("should return true for deeply equal arrays", () => {
      expect(deepEqual([[[[1]]]], [[[[1]]]])).toBe(true);
    });
  });

  describe("resolveEquality", () => {
    it("should return strictEqual for undefined", () => {
      expect(resolveEquality(undefined)).toBe(strictEqual);
    });

    it("should return strictEqual for 'strict'", () => {
      expect(resolveEquality("strict")).toBe(strictEqual);
    });

    it("should return shallowEqual for 'shallow'", () => {
      expect(resolveEquality("shallow")).toBe(shallowEqual);
    });

    it("should return shallow2Equal for 'shallow2'", () => {
      expect(resolveEquality("shallow2")).toBe(shallow2Equal);
    });

    it("should return shallow3Equal for 'shallow3'", () => {
      expect(resolveEquality("shallow3")).toBe(shallow3Equal);
    });

    it("should return deepEqual for 'deep'", () => {
      expect(resolveEquality("deep")).toBe(deepEqual);
    });

    it("should return custom function as-is", () => {
      const custom = (a: number, b: number) => a === b;
      expect(resolveEquality(custom)).toBe(custom);
    });
  });

  describe("equality helper", () => {
    it("should resolve shorthand to equality function", () => {
      expect(equality("shallow")).toBe(shallowEqual);
      expect(equality("deep")).toBe(deepEqual);
    });
  });
});

