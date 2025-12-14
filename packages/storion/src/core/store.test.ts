/**
 * Tests for store implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { store } from "./store";
import { container } from "./container";
import { batch } from "./tracking";

describe("store()", () => {
  it("should create a store spec", () => {
    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    expect(counter).toHaveProperty("__storion__", true);
    expect(counter).toHaveProperty("name", "counter");
    expect(counter).toHaveProperty("_options");
  });

  it("should create a store without name", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    expect(counter.__storion__).toBe(true);
    expect(counter.name).toBeUndefined();
  });
});

describe("store instance", () => {
  it("should create instance via container.get()", () => {
    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(instance.id).toBeDefined();
    expect(instance.state.count).toBe(0);
    expect(typeof instance.actions.increment).toBe("function");
  });

  it("should have unique id", () => {
    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores1 = container();
    const stores2 = container();

    const instance1 = stores1.get(counter);
    const instance2 = stores2.get(counter);

    expect(instance1.id).not.toBe(instance2.id);
    expect(instance1.id).toContain("counter_");
  });

  it("should modify state via actions", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: (by = 1) => {
          state.count += by;
        },
        decrement: () => {
          state.count--;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(instance.state.count).toBe(0);

    instance.actions.increment();
    expect(instance.state.count).toBe(1);

    instance.actions.increment(5);
    expect(instance.state.count).toBe(6);

    instance.actions.decrement();
    expect(instance.state.count).toBe(5);
  });

  it("should cache instances (singleton per container)", () => {
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
    expect(instance1.id).toBe(instance2.id);

    instance1.actions.increment();
    expect(instance2.state.count).toBe(1);
  });
});

describe("effects", () => {
  it("should run effects immediately during setup", () => {
    const effectFn = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ effect }) => {
        effect(effectFn);
        return {};
      },
    });

    const stores = container();
    stores.get(counter);

    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it("should re-run effects when dependencies change", () => {
    const effectFn = vi.fn();

    const counter = store({
      state: { count: 0, doubled: 0 },
      setup: ({ state, effect }) => {
        effect(() => {
          effectFn();
          state.doubled = state.count * 2;
        });

        return {
          increment: () => {
            state.count++;
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(instance.state.doubled).toBe(0);

    instance.actions.increment();
    expect(effectFn).toHaveBeenCalledTimes(2);
    expect(instance.state.doubled).toBe(2);
  });

  it("should support cleanup functions", () => {
    const cleanup = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state, effect }) => {
        effect(() => {
          const _ = state.count;
          return cleanup;
        });

        return {
          increment: () => {
            state.count++;
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(cleanup).not.toHaveBeenCalled();

    instance.actions.increment();
    expect(cleanup).toHaveBeenCalledTimes(1);

    instance.actions.increment();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("should run cleanup on dispose", () => {
    const cleanup = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ effect }) => {
        effect(() => cleanup);
        return {};
      },
    });

    const stores = container();
    stores.get(counter);

    expect(cleanup).not.toHaveBeenCalled();

    stores.dispose(counter);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should detect self-reference and throw", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state, effect }) => {
        effect(() => {
          state.count = state.count + 1;
        });
        return {};
      },
    });

    const stores = container();

    expect(() => stores.get(counter)).toThrow(/self-reference/i);
  });

  it("should throw when effect() is called in action", () => {
    let capturedEffect: any;

    const counter = store({
      state: { count: 0 },
      setup: ({ state, effect }) => {
        capturedEffect = effect;
        return {
          badAction: () => {
            // Attempt to call effect() inside action - should throw
            capturedEffect(() => {
              state.count++;
            });
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(() => instance.actions.badAction()).toThrow(/setup phase/i);
  });

  it("should throw when effect() is called in async code", async () => {
    let capturedEffect: any;

    const counter = store({
      state: { count: 0 },
      setup: ({ state, effect }) => {
        capturedEffect = effect;
        return {
          asyncAction: async () => {
            await Promise.resolve();
            // Attempt to call effect() after await - should throw
            capturedEffect(() => {
              state.count++;
            });
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    await expect(instance.actions.asyncAction()).rejects.toThrow(/setup phase/i);
  });
});

describe("dependencies via get()", () => {
  it("should get other stores via get()", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const doubler = store({
      state: { doubled: 0 },
      setup: ({ state, get, effect }) => {
        const [counterState] = get(counter);

        effect(() => {
          state.doubled = counterState.count * 2;
        });

        return {};
      },
    });

    const stores = container();
    const doublerInstance = stores.get(doubler);
    const counterInstance = stores.get(counter);

    expect(doublerInstance.state.doubled).toBe(0);

    counterInstance.actions.increment();
    expect(counterInstance.state.count).toBe(1);
  });

  it("should detect circular dependencies", () => {
    const storeA = store({
      state: { value: "a" },
      setup: ({ get }) => {
        return {};
      },
    });

    const storeB = store({
      state: { value: "b" },
      setup: ({ get }) => {
        get(storeA);
        return {};
      },
    });

    (storeA._options as any).setup = ({ get }: any) => {
      get(storeB);
      return {};
    };

    const stores = container();

    expect(() => stores.get(storeA)).toThrow(/circular/i);
  });

  it("should throw when keepAlive store depends on autoDispose store", () => {
    const shortLived = store({
      name: "shortLived",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const longLived = store({
      name: "longLived",
      state: { value: 0 },
      lifetime: "keepAlive",
      setup: ({ get }) => {
        get(shortLived); // This should throw
        return {};
      },
    });

    const stores = container();

    expect(() => stores.get(longLived)).toThrow(/lifetime mismatch/i);
  });

  it("should allow autoDispose store to depend on keepAlive store", () => {
    const longLived = store({
      name: "longLived",
      state: { value: 0 },
      lifetime: "keepAlive",
      setup: () => ({}),
    });

    const shortLived = store({
      name: "shortLived",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: ({ get }) => {
        get(longLived); // This is OK
        return {};
      },
    });

    const stores = container();

    // Should not throw
    expect(() => stores.get(shortLived)).not.toThrow();
  });

  it("should allow autoDispose store to depend on autoDispose store", () => {
    const storeA = store({
      name: "storeA",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const storeB = store({
      name: "storeB",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: ({ get }) => {
        get(storeA);
        return {};
      },
    });

    const stores = container();

    // Should not throw
    expect(() => stores.get(storeB)).not.toThrow();
  });

  it("should allow keepAlive store to depend on keepAlive store", () => {
    const storeA = store({
      name: "storeA",
      state: { value: 0 },
      lifetime: "keepAlive",
      setup: () => ({}),
    });

    const storeB = store({
      name: "storeB",
      state: { value: 0 },
      lifetime: "keepAlive",
      setup: ({ get }) => {
        get(storeA);
        return {};
      },
    });

    const stores = container();

    // Should not throw
    expect(() => stores.get(storeB)).not.toThrow();
  });

  it("should treat stores without lifetime as keepAlive by default", () => {
    const autoDisposeStore = store({
      name: "autoDisposeStore",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const defaultStore = store({
      name: "defaultStore",
      state: { value: 0 },
      // No lifetime specified - defaults to keepAlive
      setup: ({ get }) => {
        get(autoDisposeStore);
        return {};
      },
    });

    const stores = container();

    // Should throw because default is keepAlive
    expect(() => stores.get(defaultStore)).toThrow(/lifetime mismatch/i);
  });
});

describe("untrack()", () => {
  it("should not track reads inside untrack()", () => {
    const effectFn = vi.fn();

    const counter = store({
      state: { count: 0, untracked: 0, result: 0 },
      setup: ({ state, effect, untrack }) => {
        effect(() => {
          effectFn();
          const untrackedValue = untrack(() => state.untracked);
          state.result = state.count + untrackedValue;
        });

        return {
          incrementCount: () => {
            state.count++;
          },
          incrementUntracked: () => {
            state.untracked++;
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(instance.state.result).toBe(0);

    instance.actions.incrementCount();
    expect(effectFn).toHaveBeenCalledTimes(2);

    instance.actions.incrementUntracked();
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
});

describe("subscriptions", () => {
  it("should subscribe to state changes", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.subscribe(listener);

    instance.actions.increment();

    expect(listener).toHaveBeenCalled();
  });

  it("should subscribe to property changes", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0, other: "" },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
        setOther: (v: string) => {
          state.other = v;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.subscribe("count", listener);

    instance.actions.increment();
    expect(listener).toHaveBeenCalledWith({ next: 1, prev: 0 });

    // Changing other property should not trigger listener
    instance.actions.setOther("test");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should unsubscribe", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    const unsub = instance.subscribe(listener);

    instance.actions.increment();
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();

    instance.actions.increment();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("batching", () => {
  it("should batch multiple state updates", () => {
    const counter = store({
      state: { a: 0, b: 0, c: 0 },
      setup: ({ state }) => ({
        setA: (v: number) => {
          state.a = v;
        },
        setB: (v: number) => {
          state.b = v;
        },
        setC: (v: number) => {
          state.c = v;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.setA(1);
    expect(instance.state.a).toBe(1);

    instance.actions.setB(2);
    expect(instance.state.b).toBe(2);

    instance.actions.setC(3);
    expect(instance.state.c).toBe(3);

    batch(() => {
      instance.actions.setA(10);
      instance.actions.setB(20);
      instance.actions.setC(30);
    });

    expect(instance.state.a).toBe(10);
    expect(instance.state.b).toBe(20);
    expect(instance.state.c).toBe(30);
  });

  it("should return value from batch", () => {
    const result = batch(() => {
      return 42;
    });

    expect(result).toBe(42);
  });
});

describe("onDispatch", () => {
  it("should call onDispatch after action", () => {
    const onDispatch = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: (by = 1) => {
          state.count += by;
        },
        reset: () => {
          state.count = 0;
        },
      }),
      onDispatch,
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.increment(5);
    expect(onDispatch).toHaveBeenCalledWith({ name: "increment", args: [5] });

    instance.actions.reset();
    expect(onDispatch).toHaveBeenCalledWith({ name: "reset", args: [] });
  });
});

describe("onError", () => {
  it("should call onError when action throws", () => {
    const onError = vi.fn();
    const error = new Error("Test error");

    const counter = store({
      state: { count: 0 },
      setup: () => ({
        throwError: () => {
          throw error;
        },
      }),
      onError,
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(() => instance.actions.throwError()).toThrow(error);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe("disposal", () => {
  it("should throw when calling action on disposed store", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    stores.dispose(counter);

    expect(() => instance.actions.increment()).toThrow(/disposed/i);
  });
});
