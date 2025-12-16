import { describe, it, expect, vi } from "vitest";
import { collection } from "./collection";

describe("collection", () => {
  describe("get", () => {
    it("should create item on first access", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const col = collection(factory);

      const result = col.get("a");

      expect(result).toBe("value-a");
      expect(factory).toHaveBeenCalledWith("a");
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("should return same item on subsequent access", () => {
      const factory = vi.fn((key: string) => ({ id: key }));
      const col = collection(factory);

      const first = col.get("a");
      const second = col.get("a");

      expect(first).toBe(second); // Same reference
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("should create different items for different keys", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const col = collection(factory);

      expect(col.get("a")).toBe("value-a");
      expect(col.get("b")).toBe("value-b");
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe("has", () => {
    it("should return false for non-existent key", () => {
      const col = collection(() => "value");

      expect(col.has("missing")).toBe(false);
    });

    it("should return true after get creates item", () => {
      const col = collection(() => "value");

      col.get("a");

      expect(col.has("a")).toBe(true);
    });

    it("should NOT create item when checking", () => {
      const factory = vi.fn(() => "value");
      const col = collection(factory);

      col.has("a");

      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe("with", () => {
    it("should call callback when key exists", () => {
      const col = collection(() => ({ count: 0 }));
      col.get("a"); // Create item

      const callback = vi.fn();
      col.with("a", callback);

      expect(callback).toHaveBeenCalledWith({ count: 0 });
    });

    it("should NOT call callback when key does not exist", () => {
      const col = collection(() => ({ count: 0 }));

      const callback = vi.fn();
      col.with("missing", callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should NOT create item when key does not exist", () => {
      const factory = vi.fn(() => "value");
      const col = collection(factory);

      col.with("missing", () => {});

      expect(factory).not.toHaveBeenCalled();
      expect(col.has("missing")).toBe(false);
    });

    it("should return this for chaining", () => {
      const col = collection(() => "value");
      col.get("a");

      const result = col.with("a", () => {});

      expect(result).toBe(col);
    });

    it("should allow chaining multiple with calls", () => {
      const col = collection(() => ({ value: 0 }));
      col.get("a");
      col.get("b");

      const results: string[] = [];
      col
        .with("a", () => results.push("a"))
        .with("b", () => results.push("b"))
        .with("c", () => results.push("c")); // Doesn't exist

      expect(results).toEqual(["a", "b"]);
    });
  });

  describe("set", () => {
    it("should explicitly set an item", () => {
      const col = collection(() => "default");

      col.set("a", "custom");

      expect(col.get("a")).toBe("custom");
    });

    it("should override factory-created item", () => {
      const col = collection(() => "default");
      col.get("a"); // Create with factory

      col.set("a", "override");

      expect(col.get("a")).toBe("override");
    });

    it("should return this for chaining", () => {
      const col = collection(() => "value");

      const result = col.set("a", "value");

      expect(result).toBe(col);
    });
  });

  describe("size", () => {
    it("should return 0 for empty collection", () => {
      const col = collection(() => "value");

      expect(col.size).toBe(0);
    });

    it("should return correct count after items added", () => {
      const col = collection(() => "value");

      col.get("a");
      col.get("b");
      col.get("c");

      expect(col.size).toBe(3);
    });
  });

  describe("delete", () => {
    it("should remove item from collection", () => {
      const col = collection(() => "value");
      col.get("a");

      col.delete("a");

      expect(col.has("a")).toBe(false);
      expect(col.size).toBe(0);
    });

    it("should allow re-creating deleted item", () => {
      const factory = vi.fn((key: string) => `value-${key}`);
      const col = collection(factory);

      col.get("a");
      col.delete("a");
      col.get("a");

      expect(factory).toHaveBeenCalledTimes(2);
    });

    it("should return this for chaining", () => {
      const col = collection(() => "value");

      const result = col.delete("a");

      expect(result).toBe(col);
    });
  });

  describe("clear", () => {
    it("should remove all items", () => {
      const col = collection(() => "value");
      col.get("a");
      col.get("b");

      col.clear();

      expect(col.size).toBe(0);
      expect(col.has("a")).toBe(false);
      expect(col.has("b")).toBe(false);
    });

    it("should return this for chaining", () => {
      const col = collection(() => "value");

      const result = col.clear();

      expect(result).toBe(col);
    });
  });

  describe("iteration", () => {
    it("should iterate over keys", () => {
      const col = collection(() => "value");
      col.get("a");
      col.get("b");

      const keys = [...col.keys()];

      expect(keys).toEqual(["a", "b"]);
    });

    it("should iterate over values", () => {
      const col = collection((key: string) => `value-${key}`);
      col.get("a");
      col.get("b");

      const values = [...col.values()];

      expect(values).toEqual(["value-a", "value-b"]);
    });

    it("should iterate over entries", () => {
      const col = collection((key: string) => `value-${key}`);
      col.get("a");
      col.get("b");

      const entries = [...col.entries()];

      expect(entries).toEqual([
        ["a", "value-a"],
        ["b", "value-b"],
      ]);
    });
  });

  describe("initialItems", () => {
    it("should initialize with provided items", () => {
      const col = collection(
        () => "default",
        [
          ["a", "initial-a"],
          ["b", "initial-b"],
        ]
      );

      expect(col.get("a")).toBe("initial-a");
      expect(col.get("b")).toBe("initial-b");
      expect(col.size).toBe(2);
    });

    it("should use factory for keys not in initial items", () => {
      const col = collection(
        (key: string) => `factory-${key}`,
        [["a", "initial-a"]]
      );

      expect(col.get("a")).toBe("initial-a");
      expect(col.get("b")).toBe("factory-b");
    });
  });
});

