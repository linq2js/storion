import { describe, it, expect, vi } from "vitest";
import { store, container } from "../index";
import {
  list,
  map,
  toggle,
  increment,
  decrement,
  multiply,
  divide,
  clamp,
  append,
  prepend,
  merge,
  reset,
} from "./focusHelpers";
import type { FocusList, FocusMap } from "./focusHelpers";

// =============================================================================
// LIST HELPER TESTS
// =============================================================================

describe("list()", () => {
  const createListStore = <T>(initialItems: T[] | undefined, options?: Parameters<typeof list<T>>[0]) => {
    let itemsList: FocusList<T>;
    const testStore = store({
      state: { items: initialItems as T[] | undefined },
      setup({ focus }) {
        itemsList = focus("items").as(list(options));
        return {
          getList: () => itemsList,
        };
      },
    });
    const c = container();
    c.get(testStore);
    return itemsList!;
  };

  it("should get the full array", () => {
    const items = createListStore([1, 2, 3]);
    expect(items.get()).toEqual([1, 2, 3]);
  });

  it("should get item at index", () => {
    const items = createListStore(["a", "b", "c"]);
    expect(items.at(0)).toBe("a");
    expect(items.at(1)).toBe("b");
    expect(items.at(10)).toBeUndefined();
  });

  it("should return empty array when array is undefined", () => {
    const items = createListStore<number>(undefined);
    expect(items.get()).toEqual([]);
  });

  it("should get first and last items", () => {
    const items = createListStore([1, 2, 3]);
    expect(items.first()).toBe(1);
    expect(items.last()).toBe(3);
  });

  it("should return undefined for first/last on empty array", () => {
    const items = createListStore<number>([]);
    expect(items.first()).toBeUndefined();
    expect(items.last()).toBeUndefined();
  });

  it("should push items", () => {
    const items = createListStore([1]);
    items.push(2, 3);
    expect(items.get()).toEqual([1, 2, 3]);
  });

  it("should unshift items", () => {
    const items = createListStore([3]);
    items.unshift(1, 2);
    expect(items.get()).toEqual([1, 2, 3]);
  });

  it("should pop item", () => {
    const items = createListStore([1, 2, 3]);
    const popped = items.pop();
    expect(popped).toBe(3);
    expect(items.get()).toEqual([1, 2]);
  });

  it("should shift item", () => {
    const items = createListStore([1, 2, 3]);
    const shifted = items.shift();
    expect(shifted).toBe(1);
    expect(items.get()).toEqual([2, 3]);
  });

  it("should remove multiple items", () => {
    const items = createListStore([1, 2, 3, 4, 5]);
    const count = items.remove(2, 4);
    expect(count).toBe(2);
    expect(items.get()).toEqual([1, 3, 5]);
  });

  it("should removeAt specific index", () => {
    const items = createListStore(["a", "b", "c"]);
    const removed = items.removeAt(1);
    expect(removed).toBe("b");
    expect(items.get()).toEqual(["a", "c"]);
  });

  it("should removeWhere matching predicate", () => {
    const items = createListStore([1, 2, 3, 4, 5, 6]);
    const count = items.removeWhere((n) => n % 2 === 0);
    expect(count).toBe(3);
    expect(items.get()).toEqual([1, 3, 5]);
  });

  it("should insert items at index", () => {
    const items = createListStore([1, 4]);
    items.insert(1, 2, 3);
    expect(items.get()).toEqual([1, 2, 3, 4]);
  });

  it("should set item with direct value", () => {
    const items = createListStore([1, 2, 3]);
    items.set(1, 10);
    expect(items.get()).toEqual([1, 10, 3]);
  });

  it("should set item with reducer", () => {
    const items = createListStore([1, 2, 3]);
    items.set(1, (prev) => prev * 10);
    expect(items.get()).toEqual([1, 20, 3]);
  });

  it("should do nothing when set with reducer on non-existent index", () => {
    const items = createListStore([1, 2]);
    items.set(10, (prev) => prev * 10);
    expect(items.get()).toEqual([1, 2]);
  });

  it("should clear all items", () => {
    const items = createListStore([1, 2, 3]);
    items.clear();
    expect(items.get()).toEqual([]);
  });

  it("should replace entire array", () => {
    const items = createListStore([1, 2, 3]);
    items.replace([10, 20]);
    expect(items.get()).toEqual([10, 20]);
  });

  it("should find item", () => {
    const items = createListStore([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const found = items.find((item) => item.id === 2);
    expect(found).toEqual({ id: 2 });
  });

  it("should check length and isEmpty", () => {
    const items = createListStore([1, 2]);
    expect(items.length()).toBe(2);
    expect(items.isEmpty()).toBe(false);

    items.clear();
    expect(items.length()).toBe(0);
    expect(items.isEmpty()).toBe(true);
  });

  it("should auto-dispose items when removed", async () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    const item1 = { id: 1, dispose: dispose1 };
    const item2 = { id: 2, dispose: dispose2 };

    const items = createListStore([item1, item2], { autoDispose: true });
    items.remove(item1);

    // Wait for async dispose
    await new Promise((r) => setTimeout(r, 10));
    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).not.toHaveBeenCalled();
  });

  it("should auto-dispose on clear", async () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    const item1 = { id: 1, dispose: dispose1 };
    const item2 = { id: 2, dispose: dispose2 };

    const items = createListStore([item1, item2], { autoDispose: true });
    items.clear();

    await new Promise((r) => setTimeout(r, 10));
    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalled();
  });

  describe("disposal cancellation", () => {
    it("should cancel disposal when item is re-added via push before microtask", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const items = createListStore([item], { autoDispose: true });

      // Remove and re-add in same synchronous block
      items.remove(item);
      items.push(item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(items.get()).toEqual([item]);
    });

    it("should cancel disposal when item is re-added via unshift before microtask", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const items = createListStore([item], { autoDispose: true });

      items.remove(item);
      items.unshift(item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(items.get()).toEqual([item]);
    });

    it("should cancel disposal when item is re-added via insert before microtask", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const items = createListStore([item], { autoDispose: true });

      items.remove(item);
      items.insert(0, item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(items.get()).toEqual([item]);
    });

    it("should cancel disposal when item is re-added via set before microtask", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };
      const placeholder = { id: 2, dispose: vi.fn() };

      const items = createListStore([item, placeholder], { autoDispose: true });

      items.remove(item);
      items.set(0, item); // Re-add by setting at index 0

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
    });

    it("should cancel disposal when item is re-added via replace before microtask", async () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const item1 = { id: 1, dispose: dispose1 };
      const item2 = { id: 2, dispose: dispose2 };

      const items = createListStore([item1, item2], { autoDispose: true });

      items.clear(); // Schedule disposal for both
      items.replace([item1]); // Re-add item1

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose1).not.toHaveBeenCalled(); // item1 was re-added
      expect(dispose2).toHaveBeenCalled(); // item2 was not re-added
    });

    it("should still dispose items that were not re-added", async () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const item1 = { id: 1, dispose: dispose1 };
      const item2 = { id: 2, dispose: dispose2 };

      const items = createListStore([item1, item2], { autoDispose: true });

      // Remove both, re-add only item1
      items.remove(item1, item2);
      items.push(item1);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose1).not.toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it("should handle multiple remove/re-add cycles correctly", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const items = createListStore([item], { autoDispose: true });

      // Multiple cycles in same tick
      items.remove(item);
      items.push(item);
      items.remove(item);
      items.push(item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(items.get()).toEqual([item]);
    });
  });
});

// =============================================================================
// MAP HELPER TESTS
// =============================================================================

describe("map()", () => {
  const createMapStore = <T>(initial: Record<string, T> | undefined, options?: Parameters<typeof map<T>>[0]) => {
    let cacheMap: FocusMap<T>;
    const testStore = store({
      state: { cache: initial as Record<string, T> | undefined },
      setup({ focus }) {
        cacheMap = focus("cache").as(map(options));
        return {
          getMap: () => cacheMap,
        };
      },
    });
    const c = container();
    c.get(testStore);
    return cacheMap!;
  };

  it("should get the full record", () => {
    const cache = createMapStore({ a: 1, b: 2 });
    expect(cache.get()).toEqual({ a: 1, b: 2 });
  });

  it("should get value at key", () => {
    const cache = createMapStore({ a: 1, b: 2 });
    expect(cache.at("a")).toBe(1);
    expect(cache.at("x")).toBeUndefined();
  });

  it("should check has and size", () => {
    const cache = createMapStore<number>({ a: 1 });
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.size()).toBe(1);
  });

  it("should set value with direct value", () => {
    const cache = createMapStore<number>({});
    cache.set("count", 10);
    expect(cache.at("count")).toBe(10);
  });

  it("should set value with reducer", () => {
    const cache = createMapStore({ count: 5 });
    cache.set("count", (prev) => prev + 10);
    expect(cache.at("count")).toBe(15);
  });

  it("should do nothing when set with reducer on non-existent key", () => {
    const cache = createMapStore<number>({});
    cache.set("missing", (prev) => prev + 10);
    expect(cache.has("missing")).toBe(false);
  });

  it("should delete multiple keys", () => {
    const cache = createMapStore({ a: 1, b: 2, c: 3 });
    const count = cache.delete("a", "c");
    expect(count).toBe(2);
    expect(cache.get()).toEqual({ b: 2 });
  });

  it("should deleteWhere matching predicate", () => {
    const cache = createMapStore({ a: 1, b: 2, c: 3 });
    const count = cache.deleteWhere((v) => v > 1);
    expect(count).toBe(2);
    expect(cache.get()).toEqual({ a: 1 });
  });

  it("should clear all entries", () => {
    const cache = createMapStore({ a: 1, b: 2 });
    cache.clear();
    expect(cache.get()).toEqual({});
    expect(cache.isEmpty()).toBe(true);
  });

  it("should get keys, values, entries", () => {
    const cache = createMapStore({ a: 1, b: 2 });
    expect(cache.keys()).toEqual(["a", "b"]);
    expect(cache.values()).toEqual([1, 2]);
    expect(cache.entries()).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("should auto-dispose values when deleted", async () => {
    const dispose = vi.fn();
    const item = { id: 1, dispose };

    const cache = createMapStore({ item }, { autoDispose: true });
    cache.delete("item");

    await new Promise((r) => setTimeout(r, 10));
    expect(dispose).toHaveBeenCalled();
  });

  it("should auto-dispose on clear", async () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();

    const cache = createMapStore(
      { a: { dispose: dispose1 }, b: { dispose: dispose2 } },
      { autoDispose: true }
    );
    cache.clear();

    await new Promise((r) => setTimeout(r, 10));
    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalled();
  });

  describe("disposal cancellation", () => {
    it("should cancel disposal when value is re-added via set before microtask", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const cache = createMapStore({ key: item }, { autoDispose: true });

      // Delete and re-add in same synchronous block
      cache.delete("key");
      cache.set("key", item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(cache.at("key")).toBe(item);
    });

    it("should cancel disposal when value is re-added under different key", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const cache = createMapStore({ oldKey: item }, { autoDispose: true });

      // Delete from old key and add to new key
      cache.delete("oldKey");
      cache.set("newKey", item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(cache.at("newKey")).toBe(item);
    });

    it("should cancel disposal when value is re-added via replace before microtask", async () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const item1 = { id: 1, dispose: dispose1 };
      const item2 = { id: 2, dispose: dispose2 };

      const cache = createMapStore({ a: item1, b: item2 }, { autoDispose: true });

      cache.clear(); // Schedule disposal for both
      cache.replace({ a: item1 }); // Re-add item1

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose1).not.toHaveBeenCalled(); // item1 was re-added
      expect(dispose2).toHaveBeenCalled(); // item2 was not re-added
    });

    it("should still dispose values that were not re-added", async () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const item1 = { id: 1, dispose: dispose1 };
      const item2 = { id: 2, dispose: dispose2 };

      const cache = createMapStore({ a: item1, b: item2 }, { autoDispose: true });

      // Delete both, re-add only item1
      cache.delete("a", "b");
      cache.set("a", item1);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose1).not.toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it("should handle multiple delete/re-add cycles correctly", async () => {
      const dispose = vi.fn();
      const item = { id: 1, dispose };

      const cache = createMapStore({ key: item }, { autoDispose: true });

      // Multiple cycles in same tick
      cache.delete("key");
      cache.set("key", item);
      cache.delete("key");
      cache.set("key", item);

      await new Promise((r) => setTimeout(r, 10));
      expect(dispose).not.toHaveBeenCalled();
      expect(cache.at("key")).toBe(item);
    });
  });
});

// =============================================================================
// REDUCER HELPER TESTS
// =============================================================================

describe("toggle()", () => {
  it("should toggle boolean values", () => {
    const reducer = toggle();
    expect(reducer(true)).toBe(false);
    expect(reducer(false)).toBe(true);
    expect(reducer(undefined)).toBe(true);
  });
});

describe("increment()", () => {
  it("should increment by 1 by default", () => {
    const reducer = increment();
    expect(reducer(5)).toBe(6);
    expect(reducer(undefined)).toBe(1);
  });

  it("should increment by given amount", () => {
    const reducer = increment(10);
    expect(reducer(5)).toBe(15);
    expect(reducer(undefined)).toBe(10);
  });
});

describe("decrement()", () => {
  it("should decrement by 1 by default", () => {
    const reducer = decrement();
    expect(reducer(5)).toBe(4);
    expect(reducer(undefined)).toBe(-1);
  });

  it("should decrement by given amount", () => {
    const reducer = decrement(10);
    expect(reducer(15)).toBe(5);
  });
});

describe("multiply()", () => {
  it("should multiply by factor", () => {
    const reducer = multiply(2);
    expect(reducer(5)).toBe(10);
    expect(reducer(undefined)).toBe(0);
  });
});

describe("divide()", () => {
  it("should divide by divisor", () => {
    const reducer = divide(2);
    expect(reducer(10)).toBe(5);
    expect(reducer(undefined)).toBe(0);
  });
});

describe("clamp()", () => {
  it("should clamp within bounds", () => {
    const reducer = clamp(0, 100);
    expect(reducer(50)).toBe(50);
    expect(reducer(-10)).toBe(0);
    expect(reducer(150)).toBe(100);
    expect(reducer(undefined)).toBe(0);
  });
});

describe("append()", () => {
  it("should append string", () => {
    const reducer = append(" world");
    expect(reducer("hello")).toBe("hello world");
    expect(reducer(undefined)).toBe(" world");
  });
});

describe("prepend()", () => {
  it("should prepend string", () => {
    const reducer = prepend("hello ");
    expect(reducer("world")).toBe("hello world");
    expect(reducer(undefined)).toBe("hello ");
  });
});

describe("merge()", () => {
  it("should shallow merge objects", () => {
    const reducer = merge({ b: 2, c: 3 });
    expect(reducer({ a: 1, b: 0 })).toEqual({ a: 1, b: 2, c: 3 });
    expect(reducer(undefined)).toEqual({ b: 2, c: 3 });
  });
});

describe("reset()", () => {
  it("should reset to default value", () => {
    const reducer = reset(0);
    expect(reducer(100)).toBe(0);
    expect(reducer(undefined)).toBe(0);

    const arrayReducer = reset<number[]>([]);
    expect(arrayReducer([1, 2, 3])).toEqual([]);
  });
});

// =============================================================================
// INTEGRATION: REDUCERS WITH LIST/MAP
// =============================================================================

describe("reducers with list/map", () => {
  it("should use toggle with map.set", () => {
    let flags: FocusMap<boolean>;
    const testStore = store({
      state: { flags: { active: false } as Record<string, boolean> },
      setup({ focus }) {
        flags = focus("flags").as(map());
        return { noop: () => {} };
      },
    });

    const c = container();
    c.get(testStore);

    flags!.set("active", toggle());
    expect(flags!.at("active")).toBe(true);

    flags!.set("active", toggle());
    expect(flags!.at("active")).toBe(false);
  });

  it("should use increment with map.set", () => {
    let counts: FocusMap<number>;
    const testStore = store({
      state: { counts: { clicks: 0 } as Record<string, number> },
      setup({ focus }) {
        counts = focus("counts").as(map());
        return { noop: () => {} };
      },
    });

    const c = container();
    c.get(testStore);

    counts!.set("clicks", increment());
    counts!.set("clicks", increment(5));
    expect(counts!.at("clicks")).toBe(6);
  });

  it("should use merge with list.set", () => {
    let users: FocusList<{ name: string; age: number }>;
    const testStore = store({
      state: { users: [{ name: "Alice", age: 25 }] },
      setup({ focus }) {
        users = focus("users").as(list());
        return { noop: () => {} };
      },
    });

    const c = container();
    c.get(testStore);

    users!.set(0, merge({ age: 26 }));
    expect(users!.at(0)).toEqual({ name: "Alice", age: 26 });
  });

  it("should use clamp with list.set", () => {
    let values: FocusList<number>;
    const testStore = store({
      state: { values: [50, 150, -10] },
      setup({ focus }) {
        values = focus("values").as(list());
        return { noop: () => {} };
      },
    });

    const c = container();
    c.get(testStore);

    values!.set(0, clamp(0, 100));
    values!.set(1, clamp(0, 100));
    values!.set(2, clamp(0, 100));
    expect(values!.get()).toEqual([50, 100, 0]);
  });
});
