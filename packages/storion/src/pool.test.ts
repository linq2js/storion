import { describe, it, expect, vi } from "vitest";
import { pool } from "./pool";

describe("pool", () => {
  describe("callable", () => {
    it("should be callable directly as p(key)", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const p = pool(factory);

      const result = p("a"); // Direct call

      expect(result).toBe("value-a");
      expect(factory).toHaveBeenCalledWith("a");
    });

    it("should return same item on subsequent calls", () => {
      const p = pool((key: string) => ({ id: key }));

      const first = p("a");
      const second = p("a");

      expect(first).toBe(second);
    });

    it("should work with complex keys when using keyOf", () => {
      type Key = { id: string };
      const p = pool((key: Key) => ({ data: key }), { keyOf: (k) => k.id });

      const a1 = p({ id: "1" });
      const a2 = p({ id: "1" });

      expect(a1).toBe(a2);
    });
  });

  describe("get", () => {
    it("should create item on first access", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const p = pool(factory);

      const result = p.get("a");

      expect(result).toBe("value-a");
      expect(factory).toHaveBeenCalledWith("a");
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("should return same item on subsequent access", () => {
      const factory = vi.fn((key: string) => ({ id: key }));
      const p = pool(factory);

      const first = p.get("a");
      const second = p.get("a");

      expect(first).toBe(second); // Same reference
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("should create different items for different keys", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const p = pool(factory);

      expect(p.get("a")).toBe("value-a");
      expect(p.get("b")).toBe("value-b");
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe("has", () => {
    it("should return false for non-existent key", () => {
      const p = pool(() => "value");

      expect(p.has("missing")).toBe(false);
    });

    it("should return true after get creates item", () => {
      const p = pool(() => "value");

      p.get("a");

      expect(p.has("a")).toBe(true);
    });

    it("should NOT create item when checking", () => {
      const factory = vi.fn(() => "value");
      const p = pool(factory);

      p.has("a");

      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe("tap", () => {
    it("should call callback when key exists", () => {
      const p = pool(() => ({ count: 0 }));
      p.get("a"); // Create item

      const callback = vi.fn();
      p.tap("a", callback);

      expect(callback).toHaveBeenCalledWith({ count: 0 });
    });

    it("should NOT call callback when key does not exist", () => {
      const p = pool(() => ({ count: 0 }));

      const callback = vi.fn();
      p.tap("missing", callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should NOT create item when key does not exist", () => {
      const factory = vi.fn(() => "value");
      const p = pool(factory);

      p.tap("missing", () => {});

      expect(factory).not.toHaveBeenCalled();
      expect(p.has("missing")).toBe(false);
    });

    it("should return this for chaining", () => {
      const p = pool(() => "value");
      p.get("a");

      const result = p.tap("a", () => {});

      expect(result).toBe(p);
    });

    it("should allow chaining multiple tap calls", () => {
      const p = pool(() => ({ value: 0 }));
      p.get("a");
      p.get("b");

      const results: string[] = [];
      p.tap("a", () => results.push("a"))
        .tap("b", () => results.push("b"))
        .tap("c", () => results.push("c")); // Doesn't exist

      expect(results).toEqual(["a", "b"]);
    });
  });

  describe("set", () => {
    it("should explicitly set an item", () => {
      const p = pool(() => "default");

      p.set("a", "custom");

      expect(p.get("a")).toBe("custom");
    });

    it("should override factory-created item", () => {
      const p = pool(() => "default");
      p.get("a"); // Create with factory

      p.set("a", "override");

      expect(p.get("a")).toBe("override");
    });

    it("should return this for chaining", () => {
      const p = pool(() => "value");

      const result = p.set("a", "value");

      expect(result).toBe(p);
    });
  });

  describe("size", () => {
    it("should return 0 for empty pool", () => {
      const p = pool(() => "value");

      expect(p.size()).toBe(0);
    });

    it("should return correct count after items added", () => {
      const p = pool(() => "value");

      p.get("a");
      p.get("b");
      p.get("c");

      expect(p.size()).toBe(3);
    });
  });

  describe("delete", () => {
    it("should remove item from pool", () => {
      const p = pool(() => "value");
      p.get("a");

      p.delete("a");

      expect(p.has("a")).toBe(false);
      expect(p.size()).toBe(0);
    });

    it("should allow re-creating deleted item", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const p = pool(factory);

      p.get("a");
      p.delete("a");
      p.get("a");

      expect(factory).toHaveBeenCalledTimes(2);
    });

    it("should return this for chaining", () => {
      const p = pool(() => "value");

      const result = p.delete("a");

      expect(result).toBe(p);
    });
  });

  describe("clear", () => {
    it("should remove all items", () => {
      const p = pool(() => "value");
      p.get("a");
      p.get("b");

      p.clear();

      expect(p.size()).toBe(0);
      expect(p.has("a")).toBe(false);
      expect(p.has("b")).toBe(false);
    });

    it("should return this for chaining", () => {
      const p = pool(() => "value");

      const result = p.clear();

      expect(result).toBe(p);
    });
  });

  describe("iteration", () => {
    it("should iterate over keys", () => {
      const p = pool(() => "value");
      p.get("a");
      p.get("b");

      const keys = [...p.keys()];

      expect(keys).toEqual(["a", "b"]);
    });

    it("should iterate over values", () => {
      const p = pool((key: string) => `value-${key}`);
      p.get("a");
      p.get("b");

      const values = [...p.values()];

      expect(values).toEqual(["value-a", "value-b"]);
    });

    it("should iterate over entries", () => {
      const p = pool((key: string) => `value-${key}`);
      p.get("a");
      p.get("b");

      const entries = [...p.entries()];

      expect(entries).toEqual([
        ["a", "value-a"],
        ["b", "value-b"],
      ]);
    });
  });

  describe("initialItems", () => {
    it("should initialize with provided items", () => {
      const p = pool(
        () => "default",
        [
          ["a", "initial-a"],
          ["b", "initial-b"],
        ]
      );

      expect(p.get("a")).toBe("initial-a");
      expect(p.get("b")).toBe("initial-b");
      expect(p.size()).toBe(2);
    });

    it("should use factory for keys not in initial items", () => {
      const p = pool((key: string) => `factory-${key}`, [["a", "initial-a"]]);

      expect(p.get("a")).toBe("initial-a");
      expect(p.get("b")).toBe("factory-b");
    });
  });

  describe("keyOf (O(1) hash lookup)", () => {
    it("should use keyOf function to hash object keys", () => {
      type Key = { id: string; name: string };
      const p = pool((key: Key) => ({ data: key }), { keyOf: (k) => k.id });

      const a1 = p.get({ id: "1", name: "Alice" });
      const a2 = p.get({ id: "1", name: "Alice Updated" }); // Same id

      expect(a1).toBe(a2); // Same reference (matched by id)
    });

    it("should create different items for different hashes", () => {
      type Key = { id: string };
      const factory = vi.fn((key: Key) => ({ data: key }));
      const p = pool(factory, { keyOf: (k) => k.id });

      p.get({ id: "1" });
      p.get({ id: "2" });

      expect(factory).toHaveBeenCalledTimes(2);
      expect(p.size()).toBe(2);
    });

    it("should support JSON.stringify for array keys", () => {
      const p = pool((key: [string, number]) => `${key[0]}-${key[1]}`, {
        keyOf: JSON.stringify,
      });

      const a = p.get(["user", 1]);
      const b = p.get(["user", 1]); // Same array values

      expect(a).toBe(b);
      expect(p.size()).toBe(1);
    });

    it("should iterate over original keys (not hashes)", () => {
      type Key = { id: string; name: string };
      const p = pool((key: Key) => key.name, { keyOf: (k) => k.id });

      const key1 = { id: "1", name: "Alice" };
      const key2 = { id: "2", name: "Bob" };
      p.get(key1);
      p.get(key2);

      const keys = [...p.keys()];
      expect(keys).toContainEqual(key1);
      expect(keys).toContainEqual(key2);
    });

    it("should work with delete using equivalent keys", () => {
      type Key = { id: string };
      const p = pool((key: Key) => ({ data: key }), { keyOf: (k) => k.id });

      p.get({ id: "1" });
      p.delete({ id: "1" }); // Different object, same id

      expect(p.has({ id: "1" })).toBe(false);
      expect(p.size()).toBe(0);
    });
  });

  describe("equality (O(n) custom equality)", () => {
    it("should use custom equality function for keys", () => {
      type Key = { id: string };
      const p = pool((key: Key) => ({ data: key }), {
        equality: (a, b) => a.id === b.id,
      });

      const a1 = p.get({ id: "1" });
      const a2 = p.get({ id: "1" }); // Different object, same id

      expect(a1).toBe(a2);
    });

    it("should use shallow equality shorthand", () => {
      const p = pool((key: { x: number }) => key.x * 2, {
        equality: "shallow",
      });

      const key = { x: 1 };
      const a = p.get(key);
      const b = p.get({ x: 1 }); // Different object, same shape

      expect(a).toBe(b);
      expect(p.size()).toBe(1);
    });

    it("should work with has using equivalent keys", () => {
      type Key = { id: string };
      const p = pool((key: Key) => ({ data: key }), {
        equality: (a, b) => a.id === b.id,
      });

      p.get({ id: "1" });

      expect(p.has({ id: "1" })).toBe(true); // Different object
      expect(p.has({ id: "2" })).toBe(false);
    });
  });

  describe("autoDispose", () => {
    it("should call dispose on delete", () => {
      const dispose = vi.fn();
      const p = pool(() => ({ dispose }), { autoDispose: true });

      p.get("a");
      p.delete("a");

      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("should call dispose on clear", () => {
      const disposeA = vi.fn();
      const disposeB = vi.fn();
      const p = pool(
        (key: string) => ({ dispose: key === "a" ? disposeA : disposeB }),
        { autoDispose: true }
      );

      p.get("a");
      p.get("b");
      p.clear();

      expect(disposeA).toHaveBeenCalledTimes(1);
      expect(disposeB).toHaveBeenCalledTimes(1);
    });

    it("should call dispose on set when replacing", () => {
      const disposeOld = vi.fn();
      const disposeNew = vi.fn();
      const p = pool(() => ({ dispose: disposeOld }), { autoDispose: true });

      p.get("a");
      p.set("a", { dispose: disposeNew });

      expect(disposeOld).toHaveBeenCalledTimes(1);
      expect(disposeNew).not.toHaveBeenCalled();
    });

    it("should NOT call dispose when setting same value", () => {
      const dispose = vi.fn();
      const item = { dispose };
      const p = pool(() => item, { autoDispose: true });

      p.get("a");
      p.set("a", item); // Same reference

      expect(dispose).not.toHaveBeenCalled();
    });

    it("should NOT call dispose when autoDispose is false", () => {
      const dispose = vi.fn();
      const p = pool(() => ({ dispose }));

      p.get("a");
      p.delete("a");

      expect(dispose).not.toHaveBeenCalled();
    });

    it("should handle items without dispose method", () => {
      const p = pool(
        () => ({ value: 1 }), // No dispose method
        { autoDispose: true }
      );

      p.get("a");

      // Should not throw
      expect(() => p.delete("a")).not.toThrow();
    });

    it("should work with keyOf option", () => {
      const dispose = vi.fn();
      type Key = { id: string };
      const p = pool(() => ({ dispose }), {
        keyOf: (k: Key) => k.id,
        autoDispose: true,
      });

      p.get({ id: "1" });
      p.delete({ id: "1" });

      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });
});
