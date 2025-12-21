import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { store, container, forStores } from "../index";
import { persistMiddleware } from "./persist";

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
      expect(load).toHaveBeenCalledWith(myStore);
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
      expect(save).toHaveBeenCalledWith(myStore, { count: 1, name: "initial" });

      // Wait for async load to complete
      await vi.runAllTimersAsync();

      // hydrate() skips dirty props (count was modified), but hydrates clean props (name)
      // This prevents overwriting fresh user changes with stale persisted data
      expect(instance.state.count).toBe(1); // Kept user's change
      expect(instance.state.name).toBe("loaded"); // Hydrated from storage

      // Hydrating the name triggered another save
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenNthCalledWith(2, myStore, {
        count: 1,
        name: "loaded",
      });

      // State change after hydration should also be saved
      instance.actions.increment();
      expect(save).toHaveBeenCalledTimes(3);
      expect(save).toHaveBeenLastCalledWith(myStore, {
        count: 2,
        name: "loaded",
      });
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
      expect(save).toHaveBeenCalledWith(myStore, { count: 1 });
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

      expect(save).toHaveBeenCalledWith(myStore, { count: 10, name: "test" });
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
              filter: (spec) => spec.displayName === "persisted",
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
      expect(load).toHaveBeenCalledWith(persistedStore);
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
      expect(save).toHaveBeenCalledWith(myStore, { count: 1 });
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

      expect(onError).toHaveBeenCalledWith(myStore, error, "load");
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

      expect(onError).toHaveBeenCalledWith(myStore, error, "load");
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

      expect(onError).toHaveBeenCalledWith(myStore, error, "save");
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

      expect(save).toHaveBeenCalledWith(myStore, { count: 1 });
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
});
