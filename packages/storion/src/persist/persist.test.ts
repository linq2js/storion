import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { store, container, forStores } from "../index";
import { persistMiddleware, notPersisted } from "./persist";

describe("persistMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic functionality", () => {
    it("should call load on store creation", () => {
      const load = vi.fn().mockReturnValue(null);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      app.get(myStore);

      expect(load).toHaveBeenCalledTimes(1);
      // Context is passed, which has spec property
      expect(load.mock.calls[0][0].spec).toBe(myStore);
    });

    it("should hydrate store with sync load result", () => {
      const load = vi.fn().mockReturnValue({ count: 42 });
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      expect(instance.state.count).toBe(42);
    });

    it("should hydrate store with async load result", async () => {
      const load = vi.fn().mockResolvedValue({ count: 99 });
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      // Initial state before async load
      expect(instance.state.count).toBe(0);

      // Wait for async load
      await vi.runAllTimersAsync();

      expect(instance.state.count).toBe(99);
    });

    it("should save state changes that occur during async loading", async () => {
      const load = vi.fn().mockResolvedValue({ count: 100, name: "loaded" });
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0, name: "initial" },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      // State change during async loading - should be saved immediately
      instance.actions.increment();

      // Save should be called immediately (subscription is set up before loading)
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].spec).toBe(myStore);
      expect(save.mock.calls[0][1]).toEqual({ count: 1, name: "initial" });

      // Wait for async load to complete
      await vi.runAllTimersAsync();

      // hydrate() skips dirty props (count was modified), but hydrates clean props (name)
      // This prevents overwriting fresh user changes with stale persisted data
      expect(instance.state.count).toBe(1); // Kept user's change
      expect(instance.state.name).toBe("loaded"); // Hydrated from storage

      // Hydrating the name triggered another save
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0].spec).toBe(myStore);
      expect(save.mock.calls[1][1]).toEqual({ count: 1, name: "loaded" });

      // State change after hydration should also be saved
      instance.actions.increment();
      expect(save).toHaveBeenCalledTimes(3);
      expect(save.mock.calls[2][0].spec).toBe(myStore);
      expect(save.mock.calls[2][1]).toEqual({ count: 2, name: "loaded" });
    });

    it("should not hydrate when load returns null", () => {
      const load = vi.fn().mockReturnValue(null);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 5 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      expect(instance.state.count).toBe(5);
    });

    it("should not hydrate when load returns undefined", () => {
      const load = vi.fn().mockReturnValue(undefined);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 5 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      expect(instance.state.count).toBe(5);
    });
  });

  describe("save on state change", () => {
    it("should call save when state changes", () => {
      const load = vi.fn().mockReturnValue(null);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      instance.actions.increment();

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].spec).toBe(myStore);
      expect(save.mock.calls[0][1]).toEqual({ count: 1 });
    });

    it("should call save with dehydrated state", () => {
      const load = vi.fn().mockReturnValue(null);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0, name: "test" },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      instance.actions.setCount(10);

      expect(save.mock.calls[0][0].spec).toBe(myStore);
      expect(save.mock.calls[0][1]).toEqual({ count: 10, name: "test" });
    });
  });

  describe("filter option", () => {
    it("should skip stores that don't match filter", () => {
      const load = vi.fn().mockReturnValue({ count: 42 });
      const save = vi.fn();

      const persistedStore = store({
        name: "persisted",
        state: { count: 0 },
        setup: () => ({}),
      });

      const skippedStore = store({
        name: "skipped",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: [
          forStores(
            persistMiddleware({
              load,
              save,
              filter: (ctx) => ctx.spec.displayName === "persisted",
            })
          ),
        ],
      });

      const persistedInstance = app.get(persistedStore);
      const skippedInstance = app.get(skippedStore);

      // Persisted store should be hydrated
      expect(persistedInstance.state.count).toBe(42);

      // Skipped store should keep initial state
      expect(skippedInstance.state.count).toBe(0);

      // Load should only be called for persisted store
      expect(load).toHaveBeenCalledTimes(1);
      expect(load.mock.calls[0][0].spec).toBe(persistedStore);
    });
  });

  describe("optional load", () => {
    it("should work without load option (save only)", () => {
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ save })]),
      });

      const instance = app.get(myStore);

      // Initial state should be unchanged
      expect(instance.state.count).toBe(0);

      // Save should still work
      instance.actions.increment();
      expect(save.mock.calls[0][0].spec).toBe(myStore);
      expect(save.mock.calls[0][1]).toEqual({ count: 1 });
    });

    it("should work without save option (load only)", () => {
      const load = vi.fn().mockReturnValue({ count: 42 });

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load })]),
      });

      const instance = app.get(myStore);

      // Should hydrate from load
      expect(instance.state.count).toBe(42);

      // State changes should work but no save happens
      instance.actions.increment();
      expect(instance.state.count).toBe(43);
    });
  });

  describe("error handling", () => {
    it("should call onError when sync load throws", () => {
      const error = new Error("Load failed");
      const load = vi.fn().mockImplementation(() => {
        throw error;
      });
      const save = vi.fn();
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, onError })]),
      });

      app.get(myStore);

      expect(onError.mock.calls[0][0].spec).toBe(myStore);
      expect(onError.mock.calls[0][1]).toBe(error);
      expect(onError.mock.calls[0][2]).toBe("load");
    });

    it("should call onError when async load rejects", async () => {
      const error = new Error("Async load failed");
      const load = vi.fn().mockRejectedValue(error);
      const save = vi.fn();
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, onError })]),
      });

      app.get(myStore);

      await vi.runAllTimersAsync();

      expect(onError.mock.calls[0][0].spec).toBe(myStore);
      expect(onError.mock.calls[0][1]).toBe(error);
      expect(onError.mock.calls[0][2]).toBe("load");
    });

    it("should call onError when save throws", () => {
      const error = new Error("Save failed");
      const load = vi.fn().mockReturnValue(null);
      const save = vi.fn().mockImplementation(() => {
        throw error;
      });
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, onError })]),
      });

      const instance = app.get(myStore);

      instance.actions.increment();

      expect(onError.mock.calls[0][0].spec).toBe(myStore);
      expect(onError.mock.calls[0][1]).toBe(error);
      expect(onError.mock.calls[0][2]).toBe("save");
    });

    it("should still setup save subscription even if load fails", () => {
      const load = vi.fn().mockImplementation(() => {
        throw new Error("Load failed");
      });
      const save = vi.fn();
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, onError })]),
      });

      const instance = app.get(myStore);

      // State change should still trigger save
      instance.actions.increment();

      expect(save.mock.calls[0][0].spec).toBe(myStore);
      expect(save.mock.calls[0][1]).toEqual({ count: 1 });
    });
  });

  describe("non-store instances", () => {
    it("should pass through non-store instances", () => {
      const load = vi.fn();
      const save = vi.fn();

      function myService() {
        return { getValue: () => 42 };
      }

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myService);

      expect(instance.getValue()).toBe(42);
      expect(load).not.toHaveBeenCalled();
    });
  });

  describe("empty options", () => {
    it("should work with empty options (passthrough)", () => {
      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({})]),
      });

      const instance = app.get(myStore);

      // Should work normally
      expect(instance.state.count).toBe(0);
      instance.actions.increment();
      expect(instance.state.count).toBe(1);
    });
  });

  describe("force option", () => {
    it("should not overwrite dirty properties by default (force: false)", async () => {
      let resolveLoad: (value: Record<string, unknown>) => void;
      const loadPromise = new Promise<Record<string, unknown>>((resolve) => {
        resolveLoad = resolve;
      });

      const load = vi.fn().mockReturnValue(loadPromise);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0, name: "initial" },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save })]),
      });

      const instance = app.get(myStore);

      // Modify count before load completes (makes it "dirty")
      instance.actions.setCount(999);

      // Resolve load with different values
      resolveLoad!({ count: 100, name: "loaded" });
      await vi.runAllTimersAsync();

      // count was dirty, so it should NOT be overwritten
      expect(instance.state.count).toBe(999);
      // name was not dirty, so it SHOULD be updated
      expect(instance.state.name).toBe("loaded");
    });

    it("should overwrite dirty properties when force: true", async () => {
      let resolveLoad: (value: Record<string, unknown>) => void;
      const loadPromise = new Promise<Record<string, unknown>>((resolve) => {
        resolveLoad = resolve;
      });

      const load = vi.fn().mockReturnValue(loadPromise);
      const save = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0, name: "initial" },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, force: true })]),
      });

      const instance = app.get(myStore);

      // Modify count before load completes (makes it "dirty")
      instance.actions.setCount(999);

      // Resolve load with different values
      resolveLoad!({ count: 100, name: "loaded" });
      await vi.runAllTimersAsync();

      // With force: true, both should be overwritten
      expect(instance.state.count).toBe(100);
      expect(instance.state.name).toBe("loaded");
    });

    it("should work with sync load and force: true", () => {
      const myStore = store({
        name: "test",
        state: { count: 0, name: "initial" },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      // Pre-create a container to simulate dirty state scenario
      // In sync scenario, the state is hydrated immediately after store creation
      // so dirty check doesn't apply (nothing modified yet)

      const load = vi.fn().mockReturnValue({ count: 42, name: "loaded" });
      const save = vi.fn();

      const app = container({
        middleware: forStores([persistMiddleware({ load, save, force: true })]),
      });

      const instance = app.get(myStore);

      // Sync load applies immediately, so values should be from persisted state
      expect(instance.state.count).toBe(42);
      expect(instance.state.name).toBe("loaded");
    });
  });

  describe("notPersisted meta", () => {
    describe("store-level exclusion", () => {
      it("should skip entire store when marked with notPersisted()", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const tempStore = store({
          name: "temp",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
          meta: [notPersisted()],
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(tempStore);

        // Load should not be called for this store
        expect(load).not.toHaveBeenCalled();

        // State should remain at initial value
        expect(instance.state.count).toBe(0);

        // Changes should not trigger save
        instance.actions.increment();
        expect(save).not.toHaveBeenCalled();
      });

      it("should persist stores without notPersisted meta", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const persistedStore = store({
          name: "persisted",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const notPersistedStore = store({
          name: "notPersisted",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
          meta: [notPersisted()],
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const persistedInstance = app.get(persistedStore);
        const notPersistedInstance = app.get(notPersistedStore);

        // Only persisted store should be loaded
        expect(load).toHaveBeenCalledTimes(1);
        expect(load.mock.calls[0][0].spec).toBe(persistedStore);

        // Persisted store should have hydrated value
        expect(persistedInstance.state.count).toBe(42);
        // Not persisted store should have initial value
        expect(notPersistedInstance.state.count).toBe(0);

        // Only persisted store changes should trigger save
        persistedInstance.actions.increment();
        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0].spec).toBe(persistedStore);
        expect(save.mock.calls[0][1]).toEqual({ count: 43 });

        notPersistedInstance.actions.increment();
        expect(save).toHaveBeenCalledTimes(1); // Still 1
      });
    });

    describe("field-level exclusion", () => {
      it("should exclude fields marked with notPersisted from save", () => {
        const load = vi.fn().mockReturnValue(null);
        const save = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "Alice", password: "secret123", token: "abc" },
          setup: ({ state }) => ({
            setPassword: (pw: string) => {
              state.password = pw;
            },
            setName: (n: string) => {
              state.name = n;
            },
          }),
          meta: [notPersisted.for(["password", "token"])],
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(userStore);

        // Trigger save
        instance.actions.setName("Bob");

        // Save should be called without password and token
        expect(save.mock.calls[0][0].spec).toBe(userStore);
        expect(save.mock.calls[0][1]).toEqual({ name: "Bob" });
      });

      it("should exclude fields marked with notPersisted from load/hydrate", () => {
        const load = vi.fn().mockReturnValue({
          name: "Loaded",
          password: "should-not-apply",
          token: "should-not-apply",
        });
        const save = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "Initial", password: "initial-pw", token: "init-tok" },
          setup: () => ({}),
          meta: [notPersisted.for(["password", "token"])],
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(userStore);

        // name should be hydrated
        expect(instance.state.name).toBe("Loaded");
        // password and token should NOT be hydrated (kept initial)
        expect(instance.state.password).toBe("initial-pw");
        expect(instance.state.token).toBe("init-tok");
      });

      it("should work with mixed persisted and non-persisted fields", () => {
        const load = vi.fn().mockReturnValue({ count: 100, total: 500 });
        const save = vi.fn();

        const statsStore = store({
          name: "stats",
          state: { count: 0, sessionCount: 0, total: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
              state.sessionCount++;
              state.total++;
            },
          }),
          meta: [notPersisted.for("sessionCount")], // Only sessionCount is not persisted
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(statsStore);

        // count and total should be hydrated
        expect(instance.state.count).toBe(100);
        expect(instance.state.total).toBe(500);
        // sessionCount should keep initial value
        expect(instance.state.sessionCount).toBe(0);

        // After increment
        instance.actions.increment();

        // Save should exclude sessionCount
        // First call was from hydration, second is from increment
        const lastCall = save.mock.calls[save.mock.calls.length - 1];
        expect(lastCall[0].spec).toBe(statsStore);
        expect(lastCall[1]).toEqual({ count: 101, total: 501 });
      });

      it("should handle multiple excluded fields", () => {
        const save = vi.fn();

        const formStore = store({
          name: "form",
          state: {
            username: "",
            password: "",
            confirmPassword: "",
            rememberMe: false,
          },
          setup: ({ state }) => ({
            setUsername: (v: string) => {
              state.username = v;
            },
          }),
          meta: [notPersisted.for(["password", "confirmPassword"])],
        });

        const app = container({
          middleware: forStores([persistMiddleware({ save })]),
        });

        const instance = app.get(formStore);

        instance.actions.setUsername("john");

        // Only username and rememberMe should be saved
        expect(save.mock.calls[0][0].spec).toBe(formStore);
        expect(save.mock.calls[0][1]).toEqual({
          username: "john",
          rememberMe: false,
        });
      });
    });

    describe("combined with filter option", () => {
      it("should respect both filter and notPersisted meta", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const storeA = store({
          name: "storeA",
          state: { count: 0 },
          setup: () => ({}),
        });

        const storeB = store({
          name: "storeB",
          state: { count: 0 },
          setup: () => ({}),
          meta: [notPersisted()],
        });

        const storeC = store({
          name: "storeC",
          state: { count: 0 },
          setup: () => ({}),
        });

        const app = container({
          middleware: forStores([
            persistMiddleware({
              load,
              save,
              filter: (ctx) => ctx.spec.displayName !== "storeC", // Exclude storeC via filter
            }),
          ]),
        });

        app.get(storeA);
        app.get(storeB);
        app.get(storeC);

        // Only storeA should be loaded (storeB has notPersisted, storeC filtered out)
        expect(load).toHaveBeenCalledTimes(1);
        expect(load.mock.calls[0][0].spec).toBe(storeA);
      });
    });

    describe("all fields excluded", () => {
      it("should skip persistence entirely when all fields have notPersisted", () => {
        const load = vi.fn().mockReturnValue({ a: true, b: false });
        const save = vi.fn();

        const allExcludedStore = store({
          name: "allExcluded",
          state: { a: true, b: false },
          setup: ({ state }) => ({
            toggle: () => {
              state.a = !state.a;
            },
          }),
          meta: [notPersisted.for(["a", "b"])], // All fields excluded
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(allExcludedStore);

        // load should NOT be called - all fields excluded
        expect(load).not.toHaveBeenCalled();

        // State should be initial values
        expect(instance.state.a).toBe(true);
        expect(instance.state.b).toBe(false);

        // Changes should NOT trigger save
        instance.actions.toggle();
        expect(save).not.toHaveBeenCalled();
      });

      it("should persist store with some fields excluded", () => {
        const load = vi.fn().mockReturnValue({ name: "loaded" });
        const save = vi.fn();

        const partialStore = store({
          name: "partial",
          state: { name: "", password: "" },
          setup: ({ state }) => ({
            setName: (n: string) => {
              state.name = n;
            },
          }),
          meta: [notPersisted.for("password")], // Only password excluded
        });

        const app = container({
          middleware: forStores([persistMiddleware({ load, save })]),
        });

        const instance = app.get(partialStore);

        // load SHOULD be called - only one field excluded
        expect(load).toHaveBeenCalledTimes(1);

        // name should be hydrated
        expect(instance.state.name).toBe("loaded");

        // Changes should trigger save
        instance.actions.setName("updated");
        expect(save).toHaveBeenCalled();
        expect(save.mock.calls[save.mock.calls.length - 1][1]).toEqual({
          name: "updated",
        });
      });
    });
  });
});
