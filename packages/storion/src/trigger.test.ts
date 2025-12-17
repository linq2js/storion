import { describe, it, expect, vi, beforeEach } from "vitest";
import { trigger } from "./trigger";
import { ORIGINAL_FN } from "./core/fnWrapper";
import { deepEqual } from "./core/equality";

describe("trigger", () => {
  beforeEach(() => {
    trigger.clearAll();
  });

  describe("with options object", () => {
    it("should run once with empty options", () => {
      const fn = vi.fn(() => "result");

      trigger(fn, {});
      trigger(fn, {});

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should run once with undefined options", () => {
      const fn = vi.fn(() => "result");

      trigger(fn, undefined);
      trigger(fn, undefined);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should use key from options", () => {
      const fn = vi.fn(() => "result");
      const key1 = {};
      const key2 = {};

      trigger(fn, { key: key1 });
      trigger(fn, { key: key2 });

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should use deps from options", () => {
      const fn = vi.fn((x: number) => x * 2);

      trigger(fn, { deps: [1] }, 1);
      trigger(fn, { deps: [1] }, 1);
      trigger(fn, { deps: [2] }, 2);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should use custom equality from options", () => {
      const fn = vi.fn((obj: { x: number }) => obj.x);

      // With shallowEqual (default), different objects trigger re-run
      trigger(fn, { deps: [{ x: 1 }] }, { x: 1 });
      trigger(fn, { deps: [{ x: 1 }] }, { x: 1 });
      expect(fn).toHaveBeenCalledTimes(2);

      fn.mockClear();
      trigger.clearAll();

      // With deepEqual, same content doesn't trigger re-run
      trigger(fn, { deps: [{ x: 1 }], equality: deepEqual }, { x: 1 });
      trigger(fn, { deps: [{ x: 1 }], equality: deepEqual }, { x: 1 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should combine key, deps, and equality", () => {
      const fn = vi.fn((obj: { x: number }) => obj.x);
      const key = {};

      trigger(fn, { key, deps: [{ x: 1 }], equality: deepEqual }, { x: 1 });
      trigger(fn, { key, deps: [{ x: 1 }], equality: deepEqual }, { x: 1 });

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("with deps array (shorthand)", () => {
    it("should run function on first call", () => {
      const fn = vi.fn(() => "result");

      const result = trigger(fn, [1]);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe("result");
    });

    it("should return cached result when deps unchanged", () => {
      const fn = vi.fn(() => "result");

      trigger(fn, [1]);
      const result = trigger(fn, [1]);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe("result");
    });

    it("should re-run function when deps change", () => {
      const fn = vi.fn((x: number) => x * 2);

      trigger(fn, [1], 1);
      const result = trigger(fn, [2], 2);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(result).toBe(4);
    });

    it("should pass args to function", () => {
      const fn = vi.fn((a: number, b: string) => `${a}-${b}`);

      const result = trigger(fn, [1], 42, "hello");

      expect(fn).toHaveBeenCalledWith(42, "hello");
      expect(result).toBe("42-hello");
    });

    it("should work with empty deps", () => {
      const fn = vi.fn(() => "result");

      trigger(fn, []);
      trigger(fn, []);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should work with multiple deps", () => {
      const fn = vi.fn(() => "result");

      trigger(fn, [1, "a", true]);
      trigger(fn, [1, "a", true]);

      expect(fn).toHaveBeenCalledTimes(1);

      trigger(fn, [1, "a", false]);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("with key (scoped)", () => {
    it("should scope cache by key", () => {
      const fn = vi.fn(() => "result");
      const key1 = {};
      const key2 = {};

      trigger(key1, fn, [1]);
      trigger(key2, fn, [1]);

      // Same fn, same deps, different keys - should run twice
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should cache per key independently", () => {
      const fn = vi.fn((x: number) => x * 2);
      const key1 = {};
      const key2 = {};

      const result1 = trigger(key1, fn, [1], 10);
      const result2 = trigger(key2, fn, [1], 20);

      expect(result1).toBe(20);
      expect(result2).toBe(40);

      // Re-trigger with same deps should return cached
      const cached1 = trigger(key1, fn, [1], 10);
      const cached2 = trigger(key2, fn, [1], 20);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(cached1).toBe(20);
      expect(cached2).toBe(40);
    });

    it("should work with string keys", () => {
      const fn = vi.fn(() => "result");

      trigger("scope-a", fn, [1]);
      trigger("scope-b", fn, [1]);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should work with number keys", () => {
      const fn = vi.fn(() => "result");

      trigger(1, fn, [1]);
      trigger(2, fn, [1]);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should re-run when deps change within same key", () => {
      const fn = vi.fn((x: number) => x);
      const key = {};

      trigger(key, fn, [1], 1);
      trigger(key, fn, [2], 2);

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("trigger.clear()", () => {
    it("should clear cache for specific key", () => {
      const fn = vi.fn(() => "result");
      const key = {};

      trigger(key, fn, [1]);
      expect(fn).toHaveBeenCalledTimes(1);

      trigger.clear(key);

      trigger(key, fn, [1]);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not affect other keys", () => {
      const fn = vi.fn(() => "result");
      const key1 = {};
      const key2 = {};

      trigger(key1, fn, [1]);
      trigger(key2, fn, [1]);

      trigger.clear(key1);

      // key1 cleared, key2 still cached
      trigger(key1, fn, [1]);
      trigger(key2, fn, [1]);

      expect(fn).toHaveBeenCalledTimes(3); // key1 ran twice, key2 once
    });
  });

  describe("trigger.clearAll()", () => {
    it("should clear all caches", () => {
      const fn = vi.fn(() => "result");
      const key1 = {};
      const key2 = {};

      trigger(key1, fn, [1]);
      trigger(key2, fn, [1]);
      trigger(fn, [1]); // global

      trigger.clearAll();

      trigger(key1, fn, [1]);
      trigger(key2, fn, [1]);
      trigger(fn, [1]);

      expect(fn).toHaveBeenCalledTimes(6);
    });
  });

  describe("real-world scenarios", () => {
    it("should work for reset on component mount (with id)", () => {
      const reset = vi.fn();
      const id1 = {}; // component A's id
      const id2 = {}; // component B's id

      // Component A mounts
      trigger(id1, reset, []);
      expect(reset).toHaveBeenCalledTimes(1);

      // Component A re-renders
      trigger(id1, reset, []);
      expect(reset).toHaveBeenCalledTimes(1); // still 1

      // Component B mounts
      trigger(id2, reset, []);
      expect(reset).toHaveBeenCalledTimes(2);

      // Component A re-renders again
      trigger(id1, reset, []);
      expect(reset).toHaveBeenCalledTimes(2); // still 2
    });

    it("should work for fetch on deps change", () => {
      const fetchUser = vi.fn((id: number) => ({ id, name: `User ${id}` }));

      // Initial fetch
      const user1 = trigger(fetchUser, [1], 1);
      expect(fetchUser).toHaveBeenCalledTimes(1);
      expect(user1).toEqual({ id: 1, name: "User 1" });

      // Same deps, cached
      const cached = trigger(fetchUser, [1], 1);
      expect(fetchUser).toHaveBeenCalledTimes(1);
      expect(cached).toEqual({ id: 1, name: "User 1" });

      // Different deps, re-fetch
      const user2 = trigger(fetchUser, [2], 2);
      expect(fetchUser).toHaveBeenCalledTimes(2);
      expect(user2).toEqual({ id: 2, name: "User 2" });
    });
  });

  describe("wrapped function deduplication", () => {
    it("should treat wrapped and original functions as the same", () => {
      const original = vi.fn((x: number) => x * 2);
      // Simulate store action wrapping
      const wrapped = (...args: any[]) => original(...args);
      (wrapped as any)[ORIGINAL_FN] = original;

      // First call with original
      const result1 = trigger(original, [10], 10);
      expect(result1).toBe(20);
      expect(original).toHaveBeenCalledTimes(1);

      // Second call with wrapped, same deps - should NOT call again
      const result2 = trigger(wrapped, [10], 10);
      expect(result2).toBe(20);
      expect(original).toHaveBeenCalledTimes(1); // Still 1!

      // Third call with original, different deps - should call
      const result3 = trigger(original, [5], 5);
      expect(result3).toBe(10);
      expect(original).toHaveBeenCalledTimes(2);

      // Fourth call with wrapped, same deps as third - should NOT call
      const result4 = trigger(wrapped, [5], 5);
      expect(result4).toBe(10);
      expect(original).toHaveBeenCalledTimes(2); // Still 2!
    });

    it("should work with different call orders (wrapped first)", () => {
      const original = vi.fn((x: string) => `Hello ${x}`);
      
      const wrapped = (...args: any[]) => original(...args);
      (wrapped as any)[ORIGINAL_FN] = original;

      // First call with wrapped
      const result1 = trigger(wrapped, ["World"], "World");
      expect(result1).toBe("Hello World");
      expect(original).toHaveBeenCalledTimes(1);

      // Second call with original, same deps - should NOT call again
      const result2 = trigger(original, ["World"], "World");
      expect(result2).toBe("Hello World");
      expect(original).toHaveBeenCalledTimes(1); // Still 1!
    });

    it("should handle store action scenario", () => {
      // Simulate the user's example
      const fetchUserApi = { dispatch: vi.fn((id: number) => ({ id, name: `User ${id}` })) };
      
      // This is what happens inside the store wrapper
      const wrappedDispatch = (...args: any[]) => fetchUserApi.dispatch(...args);
      (wrappedDispatch as any)[ORIGINAL_FN] = fetchUserApi.dispatch;

      // Component calls with wrapped version
      const user1 = trigger(wrappedDispatch, [1], 1);
      expect(user1).toEqual({ id: 1, name: "User 1" });
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(1);

      // Store internal method calls with original - should dedupe
      const user2 = trigger(fetchUserApi.dispatch, [1], 1);
      expect(user2).toEqual({ id: 1, name: "User 1" });
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(1); // No duplicate!

      // Different deps, should call again
      const user3 = trigger(wrappedDispatch, [2], 2);
      expect(user3).toEqual({ id: 2, name: "User 2" });
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(2);
    });

    it("should handle exact user scenario with async actions", () => {
      // Simulate async action API
      const fetchUserApi = {
        dispatch: vi.fn((userId: string) => Promise.resolve({ userId, name: `User ${userId}` })),
      };

      // Inside setup(), this is the original
      const setupDispatch = fetchUserApi.dispatch;

      // Store wraps it and exposes as action
      const wrappedFetchUser = (...args: any[]) => fetchUserApi.dispatch(...args);
      (wrappedFetchUser as any)[ORIGINAL_FN] = fetchUserApi.dispatch;

      const d1 = "user123";

      // Store's otherMethod() calls trigger with original
      trigger(setupDispatch, [d1], d1);
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(1);

      // Component calls trigger with wrapped version, same d1
      // Should NOT call dispatch again - deduplication works!
      trigger(wrappedFetchUser, [d1], d1);
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(1); // Still 1! ✅

      // Different dependency
      const d2 = "user456";
      trigger(wrappedFetchUser, [d2], d2);
      expect(fetchUserApi.dispatch).toHaveBeenCalledTimes(2); // Now 2
    });
  });
});

