/**
 * Tests for container implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { store } from "./store";
import { container } from "./container";

describe("container()", () => {
  it("should create a container", () => {
    const stores = container();

    expect(stores).toHaveProperty("get");
    expect(stores).toHaveProperty("has");
    expect(stores).toHaveProperty("clear");
    expect(stores).toHaveProperty("dispose");
    expect(stores).toHaveProperty("onCreate");
    expect(stores).toHaveProperty("onDispose");
  });
});

describe("container.get()", () => {
  it("should create store instance on first get", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();

    expect(stores.has(counter)).toBe(false);

    const instance = stores.get(counter);

    expect(stores.has(counter)).toBe(true);
    expect(instance.id).toBeDefined();
    expect(instance.state.count).toBe(0);
    expect(typeof instance.actions.increment).toBe("function");
  });

  it("should return cached instance on subsequent gets", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();

    const instance1 = stores.get(counter);
    const instance2 = stores.get(counter);

    expect(instance1).toBe(instance2);
  });
});

describe("container.get(id)", () => {
  it("should return instance by id", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    const foundInstance = stores.get(instance.id);

    expect(foundInstance).toBe(instance);
  });

  it("should return undefined for unknown id", () => {
    const stores = container();

    const foundInstance = stores.get("unknown-id");

    expect(foundInstance).toBeUndefined();
  });
});

describe("container.has()", () => {
  it("should return false for non-existent stores", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();

    expect(stores.has(counter)).toBe(false);
  });

  it("should return true for existing stores", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    stores.get(counter);

    expect(stores.has(counter)).toBe(true);
  });
});

describe("container.dispose()", () => {
  it("should dispose a specific store", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(stores.has(counter)).toBe(true);

    const result = stores.dispose(counter);

    expect(result).toBe(true);
    expect(stores.has(counter)).toBe(false);
    expect(stores.get(instance.id)).toBeUndefined();
  });

  it("should return false if store does not exist", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();

    const result = stores.dispose(counter);

    expect(result).toBe(false);
  });
});

describe("container.clear()", () => {
  it("should dispose all stores", () => {
    const counter1 = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const counter2 = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const instance1 = stores.get(counter1);
    const instance2 = stores.get(counter2);

    expect(stores.has(counter1)).toBe(true);
    expect(stores.has(counter2)).toBe(true);

    stores.clear();

    expect(stores.has(counter1)).toBe(false);
    expect(stores.has(counter2)).toBe(false);
    expect(stores.get(instance1.id)).toBeUndefined();
    expect(stores.get(instance2.id)).toBeUndefined();
  });

  it("should dispose in reverse creation order", () => {
    const disposeOrder: string[] = [];

    const store1 = store({
      name: "store1",
      state: { value: 1 },
      setup: ({ effect }) => {
        effect(() => {
          return () => disposeOrder.push("store1");
        });
        return {};
      },
    });

    const store2 = store({
      name: "store2",
      state: { value: 2 },
      setup: ({ effect }) => {
        effect(() => {
          return () => disposeOrder.push("store2");
        });
        return {};
      },
    });

    const store3 = store({
      name: "store3",
      state: { value: 3 },
      setup: ({ effect }) => {
        effect(() => {
          return () => disposeOrder.push("store3");
        });
        return {};
      },
    });

    const stores = container();
    stores.get(store1);
    stores.get(store2);
    stores.get(store3);

    stores.clear();

    expect(disposeOrder).toEqual(["store3", "store2", "store1"]);
  });
});

describe("container.onCreate()", () => {
  it("should call listener when store is created", () => {
    const listener = vi.fn();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    stores.onCreate(listener);

    expect(listener).not.toHaveBeenCalled();

    const instance = stores.get(counter);

    expect(listener).toHaveBeenCalledWith(instance);
  });

  it("should return unsubscribe function", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const unsubscribe = stores.onCreate(listener);

    unsubscribe();

    stores.get(counter);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("container.onDispose()", () => {
  it("should call listener when store is disposed", () => {
    const listener = vi.fn();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    stores.onDispose(listener);
    const instance = stores.get(counter);

    expect(listener).not.toHaveBeenCalled();

    stores.dispose(counter);

    expect(listener).toHaveBeenCalledWith(instance);
  });

  it("should call listener for each store on clear", () => {
    const listener = vi.fn();

    const counter1 = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const counter2 = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    stores.onDispose(listener);
    stores.get(counter1);
    stores.get(counter2);

    stores.clear();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("isolated containers", () => {
  it("should have separate instances per container", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const container1 = container();
    const container2 = container();

    const instance1 = container1.get(counter);
    const instance2 = container2.get(counter);

    expect(instance1).not.toBe(instance2);
    expect(instance1.id).not.toBe(instance2.id);

    instance1.actions.increment();
    expect(instance1.state.count).toBe(1);
    expect(instance2.state.count).toBe(0);

    instance2.actions.increment();
    instance2.actions.increment();
    expect(instance1.state.count).toBe(1);
    expect(instance2.state.count).toBe(2);
  });
});

describe("autoDispose lifetime", () => {
  it("should auto-dispose when all subscribers unsubscribe", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add subscriber
    const unsub = instance.subscribe(() => {});

    expect(stores.has(counter)).toBe(true);

    // Unsubscribe
    unsub();

    // Should still exist immediately (grace period)
    expect(stores.has(counter)).toBe(true);

    // After grace period, should be disposed
    await vi.advanceTimersByTimeAsync(100);

    expect(stores.has(counter)).toBe(false);

    vi.useRealTimers();
  });

  it("should cancel auto-dispose if new subscriber joins during grace period", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add subscriber
    const unsub1 = instance.subscribe(() => {});

    // Unsubscribe
    unsub1();

    // Wait partial grace period
    await vi.advanceTimersByTimeAsync(50);
    expect(stores.has(counter)).toBe(true);

    // New subscriber joins
    const unsub2 = instance.subscribe(() => {});

    // Complete the grace period
    await vi.advanceTimersByTimeAsync(100);

    // Should NOT be disposed (new subscriber cancelled it)
    expect(stores.has(counter)).toBe(true);

    unsub2();

    vi.useRealTimers();
  });

  it("should track subscribe(prop, listener) as subscriber", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add property subscriber
    const unsub = instance.subscribe("count", () => {});

    expect(stores.has(counter)).toBe(true);

    // Unsubscribe
    unsub();

    // After grace period, should be disposed
    await vi.advanceTimersByTimeAsync(100);

    expect(stores.has(counter)).toBe(false);

    vi.useRealTimers();
  });

  it("should track mixed subscribe() and subscribe(prop)", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add both types of subscribers
    const unsub1 = instance.subscribe(() => {});
    const unsub2 = instance.subscribe("count", () => {});

    // Unsubscribe one
    unsub1();

    // Wait beyond grace period
    await vi.advanceTimersByTimeAsync(100);

    // Should NOT be disposed (still has a subscriber)
    expect(stores.has(counter)).toBe(true);

    // Unsubscribe the other
    unsub2();

    // After grace period
    await vi.advanceTimersByTimeAsync(100);

    // Now should be disposed
    expect(stores.has(counter)).toBe(false);

    vi.useRealTimers();
  });

  it("should NOT auto-dispose keepAlive stores", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "keepAlive", // explicit keepAlive
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add and remove subscriber
    const unsub = instance.subscribe(() => {});
    unsub();

    // After grace period
    await vi.advanceTimersByTimeAsync(100);

    // Should still exist
    expect(stores.has(counter)).toBe(true);

    vi.useRealTimers();
  });

  it("should NOT auto-dispose stores with default lifetime", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      // No lifetime specified = keepAlive by default
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    // Add and remove subscriber
    const unsub = instance.subscribe(() => {});
    unsub();

    // After grace period
    await vi.advanceTimersByTimeAsync(100);

    // Should still exist
    expect(stores.has(counter)).toBe(true);

    vi.useRealTimers();
  });

  it("should NOT count internal effects as subscribers", async () => {
    vi.useFakeTimers();

    const counter = store({
      name: "counter",
      state: { count: 0, doubled: 0 },
      lifetime: "autoDispose",
      setup: ({ state, effect }) => {
        // Internal effect - should NOT count as subscriber
        effect(() => {
          state.doubled = state.count * 2;
        });
        return {};
      },
    });

    const stores = container();
    stores.get(counter);

    // No external subscribers, only internal effect
    // After grace period, should be disposed
    await vi.advanceTimersByTimeAsync(100);

    expect(stores.has(counter)).toBe(false);

    vi.useRealTimers();
  });

  it("should call onDispose when auto-disposing", async () => {
    vi.useFakeTimers();

    const disposeListener = vi.fn();

    const counter = store({
      name: "counter",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const stores = container();
    stores.onDispose(disposeListener);

    const instance = stores.get(counter);
    const unsub = instance.subscribe(() => {});

    unsub();

    await vi.advanceTimersByTimeAsync(100);

    expect(disposeListener).toHaveBeenCalledWith(instance);

    vi.useRealTimers();
  });
});

describe("container middleware", () => {
  it("should call middleware during store creation", () => {
    const middlewareFn = vi.fn((spec, next) => next(spec));

    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [middlewareFn] });
    stores.get(counter);

    expect(middlewareFn).toHaveBeenCalledTimes(1);
    expect(middlewareFn).toHaveBeenCalledWith(counter, expect.any(Function));
  });

  it("should not call middleware for cached instances", () => {
    const middlewareFn = vi.fn((spec, next) => next(spec));

    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [middlewareFn] });
    stores.get(counter);
    stores.get(counter);
    stores.get(counter);

    expect(middlewareFn).toHaveBeenCalledTimes(1);
  });

  it("should execute middleware in order", () => {
    const order: string[] = [];

    const middleware1 = vi.fn((spec, next) => {
      order.push("m1:before");
      const instance = next(spec);
      order.push("m1:after");
      return instance;
    });

    const middleware2 = vi.fn((spec, next) => {
      order.push("m2:before");
      const instance = next(spec);
      order.push("m2:after");
      return instance;
    });

    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [middleware1, middleware2] });
    stores.get(counter);

    expect(order).toEqual(["m1:before", "m2:before", "m2:after", "m1:after"]);
  });

  it("should allow middleware to modify instance", () => {
    const middleware = vi.fn((spec, next) => {
      const instance = next(spec);
      // Add custom property for testing
      (instance as any).customProp = "added-by-middleware";
      return instance;
    });

    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [middleware] });
    const instance = stores.get(counter);

    expect((instance as any).customProp).toBe("added-by-middleware");
  });

  it("should allow logging middleware pattern", () => {
    const logs: string[] = [];

    const loggingMiddleware = vi.fn((spec, next) => {
      logs.push(`Creating: ${spec.name}`);
      const instance = next(spec);
      logs.push(`Created: ${instance.id}`);
      return instance;
    });

    const counter = store({
      name: "myCounter",
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [loggingMiddleware] });
    stores.get(counter);

    expect(logs[0]).toBe("Creating: myCounter");
    expect(logs[1]).toMatch(/^Created: /);
  });

  it("should allow middleware to intercept and return early", () => {
    const mockInstance = {
      id: "mock-id",
      state: { count: 999 },
      actions: {},
      subscribe: vi.fn(),
      dispose: vi.fn(),
      disposed: false,
    };

    const interceptMiddleware = vi.fn((_spec, _next) => {
      // Return mock instead of calling next
      return mockInstance as any;
    });

    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container({ middleware: [interceptMiddleware] });
    const instance = stores.get(counter);

    expect(instance.state.count).toBe(999);
    expect(instance.id).toBe("mock-id");
  });

  it("should work with multiple stores", () => {
    const createdStores: string[] = [];

    const trackingMiddleware = vi.fn((spec, next) => {
      createdStores.push(spec.name ?? "unnamed");
      return next(spec);
    });

    const storeA = store({
      name: "storeA",
      state: { value: "a" },
      setup: () => ({}),
    });

    const storeB = store({
      name: "storeB",
      state: { value: "b" },
      setup: () => ({}),
    });

    const stores = container({ middleware: [trackingMiddleware] });
    stores.get(storeA);
    stores.get(storeB);

    expect(createdStores).toEqual(["storeA", "storeB"]);
    expect(trackingMiddleware).toHaveBeenCalledTimes(2);
  });
});
