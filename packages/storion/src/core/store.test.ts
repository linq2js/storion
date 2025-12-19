/**
 * Tests for store implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { store } from "./store";
import { container } from "./container";
import { batch, untrack } from "./tracking";
import { effect } from "./effect";

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

    expect(counter).toHaveProperty("displayName", "counter");
    expect(counter).toHaveProperty("options");
    expect(counter.options.state).toEqual({ count: 0 });
  });

  it("should create a store without name (auto-generated)", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    expect(counter.displayName).toMatch(/^spec-\d+$/);
    expect(counter.options).toBeDefined();
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
    expect(instance1.id).toMatch(/^counter:\d+$/);
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
      setup: () => {
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
      setup: ({ state }) => {
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

  it("should support cleanup via onCleanup", () => {
    const cleanup = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => {
        effect((ctx) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          state.count; // Track dependency
          ctx.onCleanup(cleanup);
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
      setup: () => {
        effect((ctx) => {
          ctx.onCleanup(cleanup);
        });
        return {};
      },
    });

    const stores = container();
    stores.get(counter);

    expect(cleanup).not.toHaveBeenCalled();

    stores.dispose(counter);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should allow self-reference (read + write same prop)", () => {
    // Pattern: state.count += state.by
    // Effect reads count and by, writes count
    // Should NOT cause infinite loop - only subscribes to non-written props
    const counter = store({
      state: { count: 0, by: 5 },
      setup: ({ state }) => {
        effect(() => {
          // Read count and by, write count
          state.count = state.count + state.by;
        });
        return {
          setBy: (value: number) => {
            state.by = value;
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    // Initial effect runs: count = 0 + 5 = 5
    expect(instance.state.count).toBe(5);

    // Change `by` triggers effect (count is NOT subscribed due to writtenProps)
    instance.actions.setBy(10);
    // Effect runs: count = 5 + 10 = 15
    expect(instance.state.count).toBe(15);
  });

  it("should keep effect alive on error with keepAlive (default)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let runCount = 0;

    const counter = store({
      state: { count: 0, trigger: 0 },
      setup: ({ state }) => {
        effect(() => {
          runCount++;
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          state.trigger; // track trigger
          if (runCount === 1) {
            throw new Error("First run fails");
          }
          state.count = 10;
        });
        return {
          bumpTrigger: () => {
            state.trigger++;
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    // First run throws, but effect stays alive due to keepAlive default
    expect(errorSpy).toHaveBeenCalledWith(
      "Effect error (keepAlive):",
      expect.any(Error)
    );
    expect(runCount).toBe(1);

    // Trigger re-run - should succeed now
    instance.actions.bumpTrigger();
    expect(runCount).toBe(2);
    expect(instance.state.count).toBe(10);

    errorSpy.mockRestore();
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
      setup: ({ state, get }) => {
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

    (storeA.options as any).setup = ({ get }: any) => {
      get(storeB);
      return {};
    };

    const stores = container();

    expect(() => stores.get(storeA)).toThrow(/Maximum call stack size exceeded/i);
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

  it("should throw when get() is called outside setup phase (in action)", () => {
    const dependency = store({
      name: "dependency",
      state: { value: 0 },
      setup: () => ({}),
    });

    let capturedGet: any;

    const main = store({
      name: "main",
      state: { value: 0 },
      setup: ({ get }) => {
        capturedGet = get; // Capture the get function
        return {
          tryGetLater: () => {
            // This should throw - calling get() in action
            capturedGet(dependency);
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(main);

    expect(() => instance.actions.tryGetLater()).toThrow(/setup phase/i);
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

describe("create() - child stores", () => {
  it("should create a child store instance", () => {
    const child = store({
      name: "child",
      state: { value: 0 },
      setup: () => ({
        setValue: (value: number) => {
          /* no-op */
        },
      }),
    });

    let childInstance: any;
    const parent = store({
      name: "parent",
      state: { count: 0 },
      setup: ({ create }) => {
        childInstance = create(child);
        return {};
      },
    });

    const stores = container();
    stores.get(parent);

    expect(childInstance).toBeDefined();
    expect(childInstance.id).toBeDefined();
    expect(childInstance.state.value).toBe(0);
    expect(childInstance.actions.setValue).toBeInstanceOf(Function);
  });

  it("should dispose child store when parent is disposed", () => {
    const child = store({
      name: "child",
      state: { value: 0 },
      setup: () => ({}),
    });

    let childInstance: any;
    const parent = store({
      name: "parent",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: ({ create }) => {
        childInstance = create(child);
        return {};
      },
    });

    const stores = container();
    const parentInstance = stores.get(parent);

    expect(childInstance.disposed()).toBe(false);

    // Dispose parent
    parentInstance.dispose();

    // Child should also be disposed
    expect(childInstance.disposed()).toBe(true);
  });

  it("should throw when create() is called outside setup phase", () => {
    const child = store({
      name: "child",
      state: { value: 0 },
      setup: () => ({}),
    });

    const parent = store({
      name: "parent",
      state: { count: 0 },
      setup: ({ create }) => ({
        tryCreateChild: () => {
          create(child); // This should throw
        },
      }),
    });

    const stores = container();
    const instance = stores.get(parent);

    expect(() => {
      instance.actions.tryCreateChild();
    }).toThrow(/can only be called during setup phase/i);
  });

  it("should throw when keepAlive parent creates autoDispose child", () => {
    const child = store({
      name: "child",
      state: { value: 0 },
      lifetime: "autoDispose",
      setup: () => ({}),
    });

    const parent = store({
      name: "parent",
      state: { count: 0 },
      lifetime: "keepAlive",
      setup: ({ create }) => {
        create(child); // This should throw
        return {};
      },
    });

    const stores = container();

    expect(() => {
      stores.get(parent);
    }).toThrow(/lifetime mismatch/i);
  });

  it("should allow keepAlive parent to create keepAlive child", () => {
    const child = store({
      name: "child",
      state: { value: 0 },
      lifetime: "keepAlive",
      setup: () => ({}),
    });

    const parent = store({
      name: "parent",
      state: { count: 0 },
      lifetime: "keepAlive",
      setup: ({ create }) => {
        create(child);
        return {};
      },
    });

    const stores = container();

    expect(() => {
      stores.get(parent);
    }).not.toThrow();
  });

  it("should allow accessing child instance methods", () => {
    const disposeFn = vi.fn();

    const child = store({
      name: "child",
      state: { value: 0 },
      setup: ({ state }) => {
        return {
          increment: () => {
            state.value++;
          },
        };
      },
    });

    let childInstance: any;
    const parent = store({
      name: "parent",
      state: { count: 0 },
      setup: ({ create }) => {
        childInstance = create(child);

        // Can subscribe to child
        childInstance.subscribe(() => {
          /* no-op */
        });

        // Can register disposal listener
        childInstance.onDispose(disposeFn);

        return {
          incrementChild: () => {
            childInstance.actions.increment();
          },
        };
      },
    });

    const stores = container();
    const parentInstance = stores.get(parent);

    // Initial value
    expect(childInstance.state.value).toBe(0);

    // Call action through parent
    parentInstance.actions.incrementChild();

    // Child state updated
    expect(childInstance.state.value).toBe(1);

    // Dispose parent
    parentInstance.dispose();

    // Disposal listener called
    expect(disposeFn).toHaveBeenCalled();
  });

  it("should support parameterized factories with additional arguments", () => {
    const createLogger = (
      _resolver: any,
      namespace: string,
      level: number
    ) => ({
      namespace,
      level,
      log: (msg: string) => `[${namespace}:${level}] ${msg}`,
    });

    let logger: any;
    const myStore = store({
      name: "test",
      state: { count: 0 },
      setup: ({ create }) => {
        logger = create(createLogger, "my-store", 2);
        return {};
      },
    });

    const stores = container();
    stores.get(myStore);

    expect(logger.namespace).toBe("my-store");
    expect(logger.level).toBe(2);
    expect(logger.log("hello")).toBe("[my-store:2] hello");
  });

  it("should pass resolver to parameterized factory", () => {
    const configFactory = () => ({ apiUrl: "http://localhost" });

    const createApiClient = (resolver: any, timeout: number) => {
      const config = resolver.get(configFactory);
      return { url: config.apiUrl, timeout };
    };

    let client: any;
    const myStore = store({
      name: "test",
      state: { data: null },
      setup: ({ create }) => {
        client = create(createApiClient, 5000);
        return {};
      },
    });

    const stores = container();
    stores.get(myStore);

    expect(client.url).toBe("http://localhost");
    expect(client.timeout).toBe(5000);
  });

  it("should dispose parameterized factory instance with store", () => {
    const disposeFn = vi.fn();

    const createService = (_resolver: any, name: string) => ({
      name,
      dispose: disposeFn,
    });

    const myStore = store({
      name: "test",
      state: { count: 0 },
      lifetime: "autoDispose",
      setup: ({ create }) => {
        create(createService, "my-service");
        return {};
      },
    });

    const stores = container();
    const instance = stores.get(myStore);

    expect(disposeFn).not.toHaveBeenCalled();

    instance.dispose();

    expect(disposeFn).toHaveBeenCalled();
  });
});

describe("untrack()", () => {
  it("should not track reads inside untrack()", () => {
    const effectFn = vi.fn();

    const counter = store({
      state: { count: 0, untracked: 0, result: 0 },
      setup: ({ state }) => {
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

  it("should not emit change events during setup", () => {
    const setupListener = vi.fn();

    const counter = store({
      state: { count: 0, name: "test" },
      setup: ({ state }) => {
        // Modify state during setup
        state.count = 10;
        state.name = "updated";

        return {
          increment: () => {
            state.count++;
          },
        };
      },
    });

    const stores = container();

    // Subscribe to onCreate to attach listener immediately when store is created
    stores.onCreate((instance) => {
      instance.subscribe(setupListener);
    });

    // Get the store - this triggers setup
    const instance = stores.get(counter);

    // Verify state was updated during setup
    expect(instance.state.count).toBe(10);
    expect(instance.state.name).toBe("updated");

    // But no change events should have been emitted during setup
    expect(setupListener).not.toHaveBeenCalled();

    // Now after setup, changes should emit events
    instance.actions.increment();
    expect(setupListener).toHaveBeenCalledTimes(1);
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
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "increment",
        args: [5],
        nth: 1,
      })
    );

    instance.actions.reset();
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "reset",
        args: [],
        nth: 1,
      })
    );
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

describe("StoreContext.update()", () => {
  it("should update state with Immer-style updater function", () => {
    const todoStore = store({
      state: {
        todos: [] as Array<{ id: number; text: string; done: boolean }>,
        nextId: 1,
      },
      setup: ({ update }) => ({
        addTodo: (text: string) => {
          update((draft) => {
            draft.todos.push({ id: draft.nextId, text, done: false });
            draft.nextId++;
          });
        },
        toggleTodo: (id: number) => {
          update((draft) => {
            const todo = draft.todos.find((t) => t.id === id);
            if (todo) {
              todo.done = !todo.done;
            }
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(todoStore);

    instance.actions.addTodo("Learn Storion");
    expect(instance.state.todos).toHaveLength(1);
    expect(instance.state.todos[0]).toEqual({
      id: 1,
      text: "Learn Storion",
      done: false,
    });
    expect(instance.state.nextId).toBe(2);

    instance.actions.toggleTodo(1);
    expect(instance.state.todos[0].done).toBe(true);
  });

  it("should update state with partial object", () => {
    const userStore = store({
      state: {
        name: "John",
        age: 25,
        email: "john@example.com",
      },
      setup: ({ update }) => ({
        updateProfile: (partial: { name?: string; age?: number }) => {
          update(partial);
        },
      }),
    });

    const stores = container();
    const instance = stores.get(userStore);

    instance.actions.updateProfile({ name: "Jane", age: 30 });
    expect(instance.state.name).toBe("Jane");
    expect(instance.state.age).toBe(30);
    expect(instance.state.email).toBe("john@example.com");
  });

  it("should trigger reactivity when using update() with Immer", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0, multiplier: 2 },
      setup: ({ update }) => {
        effect(() => {
          listener(counter);
        });
        return {
          increment: () => {
            update((draft) => {
              draft.count++;
            });
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    listener.mockClear(); // Clear initial effect call

    instance.actions.increment();
    expect(instance.state.count).toBe(1);
    // Effect should not be called since it didn't track count
  });

  it("should trigger reactivity when using update() with partial", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 0 },
      setup: ({ state, update }) => {
        effect(() => {
          listener(state.count);
        });
        return {
          setCount: (value: number) => {
            update({ count: value });
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    listener.mockClear(); // Clear initial effect call

    instance.actions.setCount(10);
    expect(instance.state.count).toBe(10);
    expect(listener).toHaveBeenCalledWith(10);
  });

  it("should not trigger reactivity when value is same (Immer)", () => {
    const listener = vi.fn();

    const counter = store({
      state: { count: 5 },
      setup: ({ state, update }) => {
        effect(() => {
          listener(state.count);
        });
        return {
          tryUpdate: () => {
            update((draft) => {
              // No actual change
              draft.count = 5;
            });
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(counter);

    listener.mockClear();

    instance.actions.tryUpdate();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should work with nested object updates (Immer)", () => {
    const appStore = store({
      state: {
        user: {
          profile: {
            name: "John",
            settings: {
              theme: "light" as "light" | "dark",
              notifications: true,
            },
          },
        },
      },
      setup: ({ update }) => ({
        toggleTheme: () => {
          update((draft) => {
            draft.user.profile.settings.theme =
              draft.user.profile.settings.theme === "light" ? "dark" : "light";
          });
        },
        disableNotifications: () => {
          update((draft) => {
            draft.user.profile.settings.notifications = false;
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(appStore);

    expect(instance.state.user.profile.settings.theme).toBe("light");

    instance.actions.toggleTheme();
    expect(instance.state.user.profile.settings.theme).toBe("dark");

    instance.actions.disableNotifications();
    expect(instance.state.user.profile.settings.notifications).toBe(false);
  });

  it("should work with array mutations (Immer)", () => {
    const listStore = store({
      state: {
        items: [1, 2, 3],
      },
      setup: ({ update }) => ({
        push: (item: number) => {
          update((draft) => {
            draft.items.push(item);
          });
        },
        pop: () => {
          update((draft) => {
            draft.items.pop();
          });
        },
        splice: (start: number, count: number) => {
          update((draft) => {
            draft.items.splice(start, count);
          });
        },
        reverse: () => {
          update((draft) => {
            draft.items.reverse();
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(listStore);

    instance.actions.push(4);
    expect(instance.state.items).toEqual([1, 2, 3, 4]);

    instance.actions.pop();
    expect(instance.state.items).toEqual([1, 2, 3]);

    instance.actions.splice(1, 1);
    expect(instance.state.items).toEqual([1, 3]);

    instance.actions.reverse();
    expect(instance.state.items).toEqual([3, 1]);
  });

  it("should preserve reference for deep-equal props", () => {
    const profileListener = vi.fn();
    const ageListener = vi.fn();

    const userStore = store({
      state: {
        profile: { name: "John", email: "john@test.com" },
        age: 25,
      },
      equality: { profile: "deep" },
      setup: ({ update }) => ({
        updateBoth: () => {
          update((draft) => {
            // Change age
            draft.age = 26;
            // "Change" profile but with same values (deep-equal)
            draft.profile = { name: "John", email: "john@test.com" };
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(userStore);

    // Capture original profile reference
    const originalProfile = instance.state.profile;

    instance.subscribe("profile", profileListener);
    instance.subscribe("age", ageListener);

    instance.actions.updateBoth();

    // Age should change and trigger listener
    expect(instance.state.age).toBe(26);
    expect(ageListener).toHaveBeenCalledWith({ next: 26, prev: 25 });

    // Profile should keep original reference (deep-equal)
    expect(instance.state.profile).toBe(originalProfile);
    expect(profileListener).not.toHaveBeenCalled();
  });

  it("should not update state if all props are equal after custom equality", () => {
    const listener = vi.fn();

    const appStore = store({
      state: {
        data: { items: [1, 2, 3] },
      },
      equality: { data: "deep" },
      setup: ({ update }) => ({
        tryUpdate: () => {
          update((draft) => {
            // Same data, should not trigger update
            draft.data = { items: [1, 2, 3] };
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(appStore);

    const originalData = instance.state.data;
    instance.subscribe(listener);

    instance.actions.tryUpdate();

    // Reference should be preserved
    expect(instance.state.data).toBe(originalData);
    // No change notification
    expect(listener).not.toHaveBeenCalled();
    // Not dirty
    expect(instance.dirty()).toBe(false);
  });

  it("should preserve reference with proxy write and deep equality", () => {
    const profileListener = vi.fn();

    const userStore = store({
      state: {
        profile: { name: "John", email: "john@test.com" },
      },
      equality: { profile: "deep" },
      setup: ({ state }) => ({
        setProfile: (newProfile: { name: string; email: string }) => {
          // Direct proxy write
          state.profile = newProfile;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(userStore);

    const originalProfile = instance.state.profile;
    instance.subscribe("profile", profileListener);

    // Set to deep-equal value via proxy write
    instance.actions.setProfile({ name: "John", email: "john@test.com" });

    // Should NOT create new state, should NOT notify
    expect(instance.state.profile).toBe(originalProfile);
    expect(profileListener).not.toHaveBeenCalled();
    expect(instance.dirty()).toBe(false);
  });

  it("should support equality.default option", () => {
    const listener = vi.fn();

    const appStore = store({
      state: {
        profile: { name: "John" },
        settings: { theme: "dark" },
      },
      equality: {
        profile: "strict", // Override default for profile
        default: "deep", // Default to deep equality
      },
      setup: ({ update }) => ({
        updateBoth: () => {
          update((draft) => {
            draft.profile = { name: "John" }; // Different ref, strict = changed
            draft.settings = { theme: "dark" }; // Different ref, deep = equal
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(appStore);

    const originalSettings = instance.state.settings;
    instance.subscribe(listener);

    instance.actions.updateBoth();

    // settings should keep original reference (deep equality as default)
    expect(instance.state.settings).toBe(originalSettings);
    // profile changed (strict equality override)
    expect(instance.state.profile).not.toBe({ name: "John" });
    // Only one notification (from profile change)
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should support single equality value for all props", () => {
    const listener = vi.fn();

    const appStore = store({
      state: {
        data1: { value: 1 },
        data2: { value: 2 },
      },
      equality: "deep", // Deep equality for ALL props
      setup: ({ update }) => ({
        tryUpdate: () => {
          update((draft) => {
            draft.data1 = { value: 1 }; // Deep equal
            draft.data2 = { value: 2 }; // Deep equal
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(appStore);

    const original1 = instance.state.data1;
    const original2 = instance.state.data2;
    instance.subscribe(listener);

    instance.actions.tryUpdate();

    // Both should keep original references
    expect(instance.state.data1).toBe(original1);
    expect(instance.state.data2).toBe(original2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("should trigger update only for actually changed props with mixed equality", () => {
    const nameListener = vi.fn();
    const settingsListener = vi.fn();
    const countListener = vi.fn();

    const appStore = store({
      state: {
        name: "App",
        settings: { theme: "dark", lang: "en" },
        count: 0,
      },
      equality: { settings: "deep" },
      setup: ({ update }) => ({
        complexUpdate: () => {
          update((draft) => {
            draft.name = "NewApp"; // Actually changes
            draft.settings = { theme: "dark", lang: "en" }; // Deep-equal, no change
            draft.count = 5; // Actually changes
          });
        },
      }),
    });

    const stores = container();
    const instance = stores.get(appStore);

    const originalSettings = instance.state.settings;

    instance.subscribe("name", nameListener);
    instance.subscribe("settings", settingsListener);
    instance.subscribe("count", countListener);

    instance.actions.complexUpdate();

    // name changed
    expect(instance.state.name).toBe("NewApp");
    expect(nameListener).toHaveBeenCalledWith({ next: "NewApp", prev: "App" });

    // settings preserved (deep-equal)
    expect(instance.state.settings).toBe(originalSettings);
    expect(settingsListener).not.toHaveBeenCalled();

    // count changed
    expect(instance.state.count).toBe(5);
    expect(countListener).toHaveBeenCalledWith({ next: 5, prev: 0 });
  });

  describe("update.action()", () => {
    it("should create action function from updater", () => {
      const counterStore = store({
        state: { count: 0 },
        setup: ({ update }) => ({
          increment: update.action((draft) => {
            draft.count++;
          }),
        }),
      });

      const stores = container();
      const instance = stores.get(counterStore);

      expect(instance.state.count).toBe(0);
      instance.actions.increment();
      expect(instance.state.count).toBe(1);
      instance.actions.increment();
      expect(instance.state.count).toBe(2);
    });

    it("should pass arguments to updater", () => {
      const listStore = store({
        state: { items: [] as string[] },
        setup: ({ update }) => ({
          addItem: update.action((draft, name: string) => {
            draft.items.push(name);
          }),
          addMultiple: update.action((draft, ...names: string[]) => {
            draft.items.push(...names);
          }),
        }),
      });

      const stores = container();
      const instance = stores.get(listStore);

      instance.actions.addItem("apple");
      expect(instance.state.items).toEqual(["apple"]);

      instance.actions.addMultiple("banana", "cherry");
      expect(instance.state.items).toEqual(["apple", "banana", "cherry"]);
    });

    it("should work with complex nested updates", () => {
      const appStore = store({
        state: {
          user: {
            profile: { name: "John", age: 25 },
            preferences: { theme: "light" as "light" | "dark" },
          },
        },
        setup: ({ update }) => ({
          updateProfile: update.action(
            (draft, name: string, age: number) => {
              draft.user.profile.name = name;
              draft.user.profile.age = age;
            }
          ),
          toggleTheme: update.action((draft) => {
            draft.user.preferences.theme =
              draft.user.preferences.theme === "light" ? "dark" : "light";
          }),
        }),
      });

      const stores = container();
      const instance = stores.get(appStore);

      instance.actions.updateProfile("Jane", 30);
      expect(instance.state.user.profile).toEqual({ name: "Jane", age: 30 });

      instance.actions.toggleTheme();
      expect(instance.state.user.preferences.theme).toBe("dark");
    });

    it("should preserve immutability (immer)", () => {
      const listStore = store({
        state: { items: [{ id: 1, name: "A" }] },
        setup: ({ update }) => ({
          addItem: update.action((draft, name: string) => {
            draft.items.push({ id: draft.items.length + 1, name });
          }),
        }),
      });

      const stores = container();
      const instance = stores.get(listStore);

      const originalItems = instance.state.items;

      instance.actions.addItem("B");

      // Should be a new array reference
      expect(instance.state.items).not.toBe(originalItems);
      expect(instance.state.items).toEqual([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ]);
    });
  });
});

describe("dirty()", () => {
  it("should return false when no changes made", () => {
    const counter = store({
      state: { count: 0, name: "test" },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(instance.dirty()).toBe(false);
    expect(instance.dirty("count")).toBe(false);
    expect(instance.dirty("name")).toBe(false);
  });

  it("should return true after property changed", () => {
    const counter = store({
      state: { count: 0, name: "test" },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.increment();

    expect(instance.dirty()).toBe(true);
    expect(instance.dirty("count")).toBe(true);
    expect(instance.dirty("name")).toBe(false);
  });

  it("should not track changes during setup/effects as dirty", () => {
    const counter = store({
      state: { count: 0, doubled: 0 },
      setup: ({ state }) => {
        effect(() => {
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

    // Effect ran during init, but shouldn't mark as dirty
    expect(instance.dirty()).toBe(false);
    expect(instance.dirty("doubled")).toBe(false);

    // Now action should mark as dirty
    instance.actions.increment();
    expect(instance.dirty()).toBe(true);
    expect(instance.dirty("count")).toBe(true);
    expect(instance.dirty("doubled")).toBe(true); // Effect updated doubled
  });

  it("should track multiple property changes", () => {
    const user = store({
      state: { name: "John", age: 25, email: "john@test.com" },
      setup: ({ state }) => ({
        updateName: (name: string) => {
          state.name = name;
        },
        updateAge: (age: number) => {
          state.age = age;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(user);

    instance.actions.updateName("Jane");
    expect(instance.dirty("name")).toBe(true);
    expect(instance.dirty("age")).toBe(false);
    expect(instance.dirty("email")).toBe(false);

    instance.actions.updateAge(30);
    expect(instance.dirty("name")).toBe(true);
    expect(instance.dirty("age")).toBe(true);
    expect(instance.dirty("email")).toBe(false);
  });
});

describe("disposed()", () => {
  it("should return false when not disposed", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    expect(instance.disposed()).toBe(false);
  });

  it("should return true after dispose", () => {
    const counter = store({
      state: { count: 0 },
      setup: () => ({}),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.dispose();

    expect(instance.disposed()).toBe(true);
  });
});

describe("reset()", () => {
  it("should reset state to initial values", () => {
    const counter = store({
      state: { count: 0, name: "initial" },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
        setName: (name: string) => {
          state.name = name;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.increment();
    instance.actions.increment();
    instance.actions.setName("changed");

    expect(instance.state.count).toBe(2);
    expect(instance.state.name).toBe("changed");
    expect(instance.dirty()).toBe(true);

    instance.reset();

    expect(instance.state.count).toBe(0);
    expect(instance.state.name).toBe("initial");
    expect(instance.dirty()).toBe(false);
  });

  it("should trigger listeners for changed properties", () => {
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

    instance.actions.increment();
    instance.subscribe("count", listener);

    listener.mockClear();
    instance.reset();

    expect(listener).toHaveBeenCalledWith({ next: 0, prev: 1 });
  });

  it("should not trigger listeners for unchanged properties", () => {
    const countListener = vi.fn();
    const nameListener = vi.fn();

    const counter = store({
      state: { count: 0, name: "test" },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.increment(); // Only count changes
    instance.subscribe("count", countListener);
    instance.subscribe("name", nameListener);

    countListener.mockClear();
    nameListener.mockClear();
    instance.reset();

    expect(countListener).toHaveBeenCalledTimes(1);
    expect(nameListener).not.toHaveBeenCalled();
  });

  it("should reset state including effect-modified values", () => {
    const counter = store({
      state: { count: 0, doubled: 0 },
      setup: ({ state }) => {
        effect(() => {
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

    // Initial state after effect: { count: 0, doubled: 0 }
    expect(instance.state.doubled).toBe(0);

    instance.actions.increment();
    expect(instance.state.count).toBe(1);
    expect(instance.state.doubled).toBe(2);

    instance.reset();

    expect(instance.state.count).toBe(0);
    expect(instance.state.doubled).toBe(0);
    expect(instance.dirty()).toBe(false);
  });

  it("should be callable from StoreContext in actions", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state, reset }) => ({
        increment: () => {
          state.count++;
        },
        resetState: () => {
          reset();
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.increment();
    instance.actions.increment();
    expect(instance.state.count).toBe(2);

    instance.actions.resetState();
    expect(instance.state.count).toBe(0);
  });

  it("should allow dirty() check from StoreContext", () => {
    let isDirtyFromAction = false;

    const counter = store({
      state: { count: 0 },
      setup: ({ state, dirty }) => ({
        increment: () => {
          state.count++;
        },
        checkDirty: () => {
          isDirtyFromAction = dirty();
        },
        checkDirtyCount: () => {
          isDirtyFromAction = dirty("count");
        },
      }),
    });

    const stores = container();
    const instance = stores.get(counter);

    instance.actions.checkDirty();
    expect(isDirtyFromAction).toBe(false);

    instance.actions.increment();
    instance.actions.checkDirty();
    expect(isDirtyFromAction).toBe(true);

    instance.actions.checkDirtyCount();
    expect(isDirtyFromAction).toBe(true);
  });
});

describe("StoreContext.mixin()", () => {
  it("should use a mixin to compose actions", () => {
    type CounterState = { count: number };
    type CounterActions = {
      increment: () => void;
      decrement: () => void;
    };

    const counterMixin = (
      ctx: import("../types").StoreContext<CounterState>
    ): CounterActions => ({
      increment: () => {
        ctx.state.count++;
      },
      decrement: () => {
        ctx.state.count--;
      },
    });

    const myStore = store({
      state: { count: 0 },
      setup: (ctx) => ctx.mixin(counterMixin),
    });

    const stores = container();
    const instance = stores.get(myStore);

    expect(instance.state.count).toBe(0);
    instance.actions.increment();
    expect(instance.state.count).toBe(1);
    instance.actions.decrement();
    expect(instance.state.count).toBe(0);
  });

  it("should pass additional arguments to mixin", () => {
    type CounterState = { count: number };

    const multiplyMixin = (
      ctx: import("../types").StoreContext<CounterState>,
      factor: number
    ) => ({
      multiply: () => {
        ctx.state.count *= factor;
      },
    });

    const myStore = store({
      state: { count: 5 },
      setup: (ctx) => ctx.mixin(multiplyMixin, 3),
    });

    const stores = container();
    const instance = stores.get(myStore);

    instance.actions.multiply();
    expect(instance.state.count).toBe(15);
  });

  it("should compose multiple mixins", () => {
    type AppState = { count: number; name: string };

    const counterMixin = (ctx: import("../types").StoreContext<AppState>) => ({
      increment: () => {
        ctx.state.count++;
      },
    });

    const nameMixin = (ctx: import("../types").StoreContext<AppState>) => ({
      setName: (name: string) => {
        ctx.state.name = name;
      },
    });

    const myStore = store({
      state: { count: 0, name: "initial" },
      setup: (ctx) => ({
        ...ctx.mixin(counterMixin),
        ...ctx.mixin(nameMixin),
        reset: () => {
          ctx.reset();
        },
      }),
    });

    const stores = container();
    const instance = stores.get(myStore);

    instance.actions.increment();
    instance.actions.setName("updated");
    expect(instance.state.count).toBe(1);
    expect(instance.state.name).toBe("updated");

    instance.actions.reset();
    expect(instance.state.count).toBe(0);
    expect(instance.state.name).toBe("initial");
  });

  it("should allow mixin to access get() for dependencies", () => {
    const counter = store({
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const syncMixin = (
      ctx: import("../types").StoreContext<{ synced: number }>,
      counterSpec: typeof counter
    ) => {
      const [counterState] = ctx.get(counterSpec);
      effect(() => {
        ctx.state.synced = counterState.count;
      });
      return {};
    };

    const syncedStore = store({
      state: { synced: 0 },
      setup: (ctx) => ctx.mixin(syncMixin, counter),
    });

    const stores = container();
    const syncedInstance = stores.get(syncedStore);
    const counterInstance = stores.get(counter);

    expect(syncedInstance.state.synced).toBe(0);
    counterInstance.actions.increment();
    expect(syncedInstance.state.synced).toBe(1);
  });

  it("should throw when mixin() is called outside setup phase", () => {
    let capturedCtx: import("../types").StoreContext<{ count: number }>;

    const myStore = store({
      state: { count: 0 },
      setup: (ctx) => {
        capturedCtx = ctx;
        return {
          badAction: () => {
            // Attempt to call mixin() inside action
            capturedCtx.mixin(() => ({}));
          },
        };
      },
    });

    const stores = container();
    const instance = stores.get(myStore);

    expect(() => instance.actions.badAction()).toThrow(/setup phase/i);
  });
});

describe("focus()", () => {
  it("should create a getter/setter tuple for a nested path", () => {
    interface State {
      profile: {
        name: string;
        address: {
          city: string;
          street: string;
        };
      };
    }

    const userStore = store({
      state: {
        profile: {
          name: "John",
          address: {
            city: "NYC",
            street: "5th Ave",
          },
        },
      } as State,
      setup: ({ focus }) => {
        const [getCity, setCity] = focus("profile.address.city");
        const [, setAddress] = focus("profile.address");
        return { getCity, setCity, setAddress };
      },
    });

    const stores = container();
    const instance = stores.get(userStore);

    // Test getting a deep property
    const getCity = instance.actions.getCity;
    const setCity = instance.actions.setCity;
    expect(getCity()).toBe("NYC");

    // Test setting a deep property
    setCity("LA");
    expect(instance.state.profile.address.city).toBe("LA");
    expect(getCity()).toBe("LA");

    // Test setting an object
    const setAddress = instance.actions.setAddress;
    setAddress({ city: "SF", street: "Market St" });
    expect(instance.state.profile.address.city).toBe("SF");
    expect(instance.state.profile.address.street).toBe("Market St");
  });

  it("should support multiple focus instances for sub-paths", () => {
    interface State {
      profile: {
        address: {
          city: string;
          zip: string;
        };
      };
    }

    const userStore = store({
      state: {
        profile: {
          address: {
            city: "NYC",
            zip: "10001",
          },
        },
      } as State,
      setup: ({ focus }) => {
        // Create separate focus instances for each sub-path
        const [, addressFocus] = focus("profile.address");
        const [, cityFocus] = focus("profile.address.city");
        const [, zipFocus] = focus("profile.address.zip");
        return { addressFocus, cityFocus, zipFocus };
      },
    });

    const stores = container();
    const instance = stores.get(userStore);

    const setCity = instance.actions.cityFocus;
    setCity("Boston");
    expect(instance.state.profile.address.city).toBe("Boston");

    const setZip = instance.actions.zipFocus;
    setZip("02101");
    expect(instance.state.profile.address.zip).toBe("02101");
  });

  it("should auto-create intermediate objects when null", () => {
    interface State {
      user: {
        profile?: {
          settings?: {
            theme: string;
          };
        };
      };
    }

    const settingsStore = store({
      state: {
        user: {},
      } as unknown as State,
      setup: ({ focus }) => {
        const [, themeFocus] = focus("user.profile.settings.theme");
        return { themeFocus };
      },
    });

    const stores = container();
    const instance = stores.get(settingsStore);

    // profile and settings don't exist yet
    expect(instance.state.user.profile).toBeUndefined();

    // Setting should auto-create the path
    const setTheme = instance.actions.themeFocus;
    setTheme("dark");

    expect(instance.state.user.profile).toBeDefined();
    expect(instance.state.user.profile?.settings).toBeDefined();
    expect(instance.state.user.profile?.settings?.theme).toBe("dark");
  });

  it("should trigger reactivity when setting values", () => {
    const listener = vi.fn();

    const userStore = store({
      state: {
        profile: {
          name: "John",
        },
      },
      setup: ({ focus }) => {
        const [, nameFocus] = focus("profile.name");
        return { nameFocus };
      },
    });

    const stores = container();
    const instance = stores.get(userStore);

    instance.subscribe(listener);
    const setName = instance.actions.nameFocus;
    setName("Jane");

    expect(listener).toHaveBeenCalled();
    expect(instance.state.profile.name).toBe("Jane");
  });

  it("should work with top-level properties", () => {
    const userStore = store({
      state: {
        name: "John",
        age: 30,
      },
      setup: ({ focus }) => {
        const [getName, setName] = focus("name");
        const [getAge, setAge] = focus("age");
        return { getName, setName, getAge, setAge };
      },
    });

    const stores = container();
    const instance = stores.get(userStore);

    const getName = instance.actions.getName;
    const setName = instance.actions.setName;
    const getAge = instance.actions.getAge;
    const setAge = instance.actions.setAge;

    expect(getName()).toBe("John");
    setName("Jane");
    expect(instance.state.name).toBe("Jane");

    expect(getAge()).toBe(30);
    setAge(25);
    expect(instance.state.age).toBe(25);
  });
});
