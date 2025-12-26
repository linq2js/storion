import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { store, container, forStores, meta } from "../index";
import { persist, notPersisted, persisted, PersistContext } from "./persist";

describe("persist", () => {
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
      let capturedContext: PersistContext | undefined;

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([
          persist({
            handler: (ctx) => {
              capturedContext = ctx;
              return { load, save };
            },
          }),
        ]),
      });

      app.get(myStore);

      expect(load).toHaveBeenCalledTimes(1);
      expect(capturedContext?.spec).toBe(myStore);
      expect(capturedContext?.store).toBeDefined();
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
      });

      const instance = app.get(myStore);

      // State change during async loading - should be saved immediately
      instance.actions.increment();

      // Save should be called immediately (subscription is set up before loading)
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toEqual({ count: 1, name: "initial" });

      // Wait for async load to complete
      await vi.runAllTimersAsync();

      // hydrate() skips dirty props (count was modified), but hydrates clean props (name)
      expect(instance.state.count).toBe(1); // Kept user's change
      expect(instance.state.name).toBe("loaded"); // Hydrated from storage

      // Hydrating the name triggered another save
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0]).toEqual({ count: 1, name: "loaded" });

      // State change after hydration should also be saved
      instance.actions.increment();
      expect(save).toHaveBeenCalledTimes(3);
      expect(save.mock.calls[2][0]).toEqual({ count: 2, name: "loaded" });
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
      });

      const instance = app.get(myStore);

      instance.actions.increment();

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toEqual({ count: 1 });
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
      });

      const instance = app.get(myStore);

      instance.actions.setCount(10);

      expect(save.mock.calls[0][0]).toEqual({ count: 10, name: "test" });
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
            persist({
              filter: (ctx) => ctx.spec.displayName === "persisted",
              handler: () => ({ load, save }),
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
    });
  });

  describe("optional load/save", () => {
    it("should work without load (save only)", () => {
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
        middleware: forStores([
          persist({
            handler: () => ({ save }),
          }),
        ]),
      });

      const instance = app.get(myStore);

      // Initial state should be unchanged
      expect(instance.state.count).toBe(0);

      // Save should still work
      instance.actions.increment();
      expect(save.mock.calls[0][0]).toEqual({ count: 1 });
    });

    it("should work without save (load only)", () => {
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
        middleware: forStores([
          persist({
            handler: () => ({ load }),
          }),
        ]),
      });

      const instance = app.get(myStore);

      // Should hydrate from load
      expect(instance.state.count).toBe(42);

      // State changes should work but no save happens
      instance.actions.increment();
      expect(instance.state.count).toBe(43);
    });
  });

  describe("async handler (init)", () => {
    it("should support async handler for IndexedDB-like initialization", async () => {
      const load = vi.fn().mockReturnValue({ count: 42 });
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
        middleware: forStores([
          persist({
            handler: async () => {
              // Simulate async DB initialization
              await Promise.resolve();
              return { load, save };
            },
          }),
        ]),
      });

      const instance = app.get(myStore);

      // Before async handler resolves, state is initial
      expect(instance.state.count).toBe(0);

      // Wait for async handler
      await vi.runAllTimersAsync();

      // After handler resolves, load is called and state is hydrated
      expect(load).toHaveBeenCalledTimes(1);
      expect(instance.state.count).toBe(42);

      // Save should work after handler resolves
      instance.actions.increment();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toEqual({ count: 43 });
    });

    it("should provide store instance in handler context", () => {
      let capturedStore: unknown;

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([
          persist({
            handler: (ctx) => {
              capturedStore = ctx.store;
              return {};
            },
          }),
        ]),
      });

      const instance = app.get(myStore);

      expect(capturedStore).toBe(instance);
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
            onError,
          }),
        ]),
      });

      app.get(myStore);

      expect(onError).toHaveBeenCalledWith(error, "load");
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
            onError,
          }),
        ]),
      });

      app.get(myStore);

      await vi.runAllTimersAsync();

      expect(onError).toHaveBeenCalledWith(error, "load");
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
            onError,
          }),
        ]),
      });

      const instance = app.get(myStore);

      instance.actions.increment();

      expect(onError).toHaveBeenCalledWith(error, "save");
    });

    it("should call onError when handler (init) throws", () => {
      const error = new Error("Init failed");
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([
          persist({
            handler: () => {
              throw error;
            },
            onError,
          }),
        ]),
      });

      app.get(myStore);

      expect(onError).toHaveBeenCalledWith(error, "init");
    });

    it("should call onError when async handler (init) rejects", async () => {
      const error = new Error("Async init failed");
      const onError = vi.fn();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: () => ({}),
      });

      const app = container({
        middleware: forStores([
          persist({
            handler: async () => {
              throw error;
            },
            onError,
          }),
        ]),
      });

      app.get(myStore);

      await vi.runAllTimersAsync();

      expect(onError).toHaveBeenCalledWith(error, "init");
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
            onError,
          }),
        ]),
      });

      const instance = app.get(myStore);

      // State change should still trigger save
      instance.actions.increment();

      expect(save.mock.calls[0][0]).toEqual({ count: 1 });
    });
  });

  describe("non-store instances", () => {
    it("should pass through non-store instances", () => {
      const handler = vi.fn();

      function myService() {
        return { getValue: () => 42 };
      }

      const app = container({
        middleware: forStores([persist({ handler: () => ({}) })]),
      });

      const instance = app.get(myService);

      expect(instance.getValue()).toBe(42);
      expect(handler).not.toHaveBeenCalled();
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
          }),
        ]),
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
        middleware: forStores([
          persist({
            handler: () => ({ load, save }),
            force: true,
          }),
        ]),
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
          middleware: forStores([
            persist({
              handler: () => ({ load, save }),
            }),
          ]),
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
    });

    describe("field-level exclusion", () => {
      it("should exclude fields marked with notPersisted from save", () => {
        const load = vi.fn().mockReturnValue(null);
        const save = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "Alice", password: "secret123", token: "abc" },
          setup: ({ state }) => ({
            setName: (n: string) => {
              state.name = n;
            },
          }),
          meta: [notPersisted.for(["password", "token"])],
        });

        const app = container({
          middleware: forStores([
            persist({
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(userStore);

        // Trigger save
        instance.actions.setName("Bob");

        // Save should be called without password and token
        expect(save.mock.calls[0][0]).toEqual({ name: "Bob" });
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
          middleware: forStores([
            persist({
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(userStore);

        // name should be hydrated
        expect(instance.state.name).toBe("Loaded");
        // password and token should NOT be hydrated
        expect(instance.state.password).toBe("initial-pw");
        expect(instance.state.token).toBe("init-tok");
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
          meta: [notPersisted.for(["a", "b"])],
        });

        const app = container({
          middleware: forStores([
            persist({
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(allExcludedStore);

        // load should NOT be called - all fields excluded
        expect(load).not.toHaveBeenCalled();

        // Changes should NOT trigger save
        instance.actions.toggle();
        expect(save).not.toHaveBeenCalled();
      });
    });
  });

  describe("fields option for multi-storage patterns", () => {
    it("should support multiple persist middleware with different storage targets", () => {
      const sessionStore = meta();
      const localStore = meta();

      const sessionSave = vi.fn();
      const localSave = vi.fn();

      const authStore = store({
        name: "auth",
        state: {
          accessToken: "",
          refreshToken: "",
          userId: "",
          lastActivity: 0,
        },
        setup: ({ state }) => ({
          setTokens: (access: string, refresh: string) => {
            state.accessToken = access;
            state.refreshToken = refresh;
          },
          setUserId: (id: string) => {
            state.userId = id;
          },
        }),
        meta: [
          sessionStore.for(["accessToken", "lastActivity"]),
          localStore.for(["refreshToken", "userId"]),
        ],
      });

      const sessionMiddleware = persist({
        filter: ({ meta }) => meta.any(sessionStore),
        fields: ({ meta }) => meta.fields(sessionStore),
        handler: () => ({ save: sessionSave }),
      });

      const localMiddleware = persist({
        filter: ({ meta }) => meta.any(localStore),
        fields: ({ meta }) => meta.fields(localStore),
        handler: () => ({ save: localSave }),
      });

      const app = container({
        middleware: forStores([sessionMiddleware, localMiddleware]),
      });

      const instance = app.get(authStore);

      instance.actions.setTokens("access123", "refresh456");
      instance.actions.setUserId("user1");

      // Session storage should only save accessToken and lastActivity
      const sessionCalls = sessionSave.mock.calls;
      expect(sessionCalls.length).toBeGreaterThan(0);
      const lastSessionCall = sessionCalls[sessionCalls.length - 1][0];
      expect(Object.keys(lastSessionCall).sort()).toEqual([
        "accessToken",
        "lastActivity",
      ]);

      // Local storage should only save refreshToken and userId
      const localCalls = localSave.mock.calls;
      expect(localCalls.length).toBeGreaterThan(0);
      const lastLocalCall = localCalls[localCalls.length - 1][0];
      expect(Object.keys(lastLocalCall).sort()).toEqual([
        "refreshToken",
        "userId",
      ]);
    });
  });

  describe("handler closure pattern", () => {
    it("should allow shared resources via closure", () => {
      const storage = new Map<string, string>();

      const myStore = store({
        name: "test",
        state: { count: 0 },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const app = container({
        middleware: forStores([
          persist({
            handler: (ctx) => {
              // Key computed once per store
              const key = `app:${ctx.displayName}`;
              return {
                load: () => {
                  const data = storage.get(key);
                  return data ? JSON.parse(data) : null;
                },
                save: (state) => {
                  storage.set(key, JSON.stringify(state));
                },
              };
            },
          }),
        ]),
      });

      const instance = app.get(myStore);

      instance.actions.setCount(42);

      // Verify storage was used
      expect(storage.get("app:test")).toBe('{"count":42}');
    });
  });

  describe("persistedOnly option", () => {
    describe("store-level persisted meta", () => {
      it("should skip stores without persisted meta when persistedOnly: true", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const unmarkedStore = store({
          name: "unmarked",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(unmarkedStore);

        // Load should not be called - store has no persisted meta
        expect(load).not.toHaveBeenCalled();

        // State should remain at initial value
        expect(instance.state.count).toBe(0);

        // Changes should not trigger save
        instance.actions.increment();
        expect(save).not.toHaveBeenCalled();
      });

      it("should persist stores with persisted() meta when persistedOnly: true", () => {
        const load = vi.fn().mockReturnValue({ count: 42, name: "loaded" });
        const save = vi.fn();

        const markedStore = store({
          name: "marked",
          state: { count: 0, name: "initial" },
          setup: ({ state }) => ({
            setCount: (n: number) => {
              state.count = n;
            },
          }),
          meta: [persisted()],
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(markedStore);

        // Load should be called
        expect(load).toHaveBeenCalledTimes(1);

        // State should be hydrated
        expect(instance.state.count).toBe(42);
        expect(instance.state.name).toBe("loaded");

        // Changes should trigger save with all fields
        instance.actions.setCount(100);
        expect(save).toHaveBeenCalled();
        expect(save.mock.calls[0][0]).toEqual({ count: 100, name: "loaded" });
      });
    });

    describe("field-level persisted meta", () => {
      it("should persist only fields with persisted.for() when persistedOnly: true", () => {
        const load = vi.fn().mockReturnValue({
          theme: "dark",
          fontSize: 18,
          cache: { temp: "data" },
        });
        const save = vi.fn();

        const settingsStore = store({
          name: "settings",
          state: { theme: "light", fontSize: 14, cache: {} },
          setup: ({ state }) => ({
            setTheme: (t: string) => {
              state.theme = t;
            },
            setFontSize: (s: number) => {
              state.fontSize = s;
            },
          }),
          meta: [persisted.for(["theme", "fontSize"])],
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(settingsStore);

        // Load should be called
        expect(load).toHaveBeenCalledTimes(1);

        // Only persisted fields should be hydrated
        expect(instance.state.theme).toBe("dark");
        expect(instance.state.fontSize).toBe(18);
        // cache should NOT be hydrated
        expect(instance.state.cache).toEqual({});

        // Changes should trigger save with only persisted fields
        instance.actions.setTheme("blue");
        expect(save.mock.calls[0][0]).toEqual({ theme: "blue", fontSize: 18 });
      });
    });

    describe("notPersisted takes priority over persisted", () => {
      it("should exclude notPersisted fields even when store has persisted()", () => {
        const load = vi.fn().mockReturnValue({
          name: "loaded",
          password: "should-not-apply",
        });
        const save = vi.fn();

        const userStore = store({
          name: "user",
          state: { name: "initial", password: "secret" },
          setup: ({ state }) => ({
            setName: (n: string) => {
              state.name = n;
            },
          }),
          meta: [persisted(), notPersisted.for("password")],
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(userStore);

        // name should be hydrated
        expect(instance.state.name).toBe("loaded");
        // password should NOT be hydrated (notPersisted takes priority)
        expect(instance.state.password).toBe("secret");

        // Save should exclude password
        instance.actions.setName("Bob");
        expect(save.mock.calls[0][0]).toEqual({ name: "Bob" });
      });

      it("should skip entire store with notPersisted() even if persisted() is present", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const conflictingStore = store({
          name: "conflicting",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
          // Both metas - notPersisted should win
          meta: [persisted(), notPersisted()],
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(conflictingStore);

        // Should be skipped entirely
        expect(load).not.toHaveBeenCalled();
        expect(instance.state.count).toBe(0);
        instance.actions.increment();
        expect(save).not.toHaveBeenCalled();
      });
    });

    describe("default behavior (persistedOnly: false)", () => {
      it("should persist all stores by default", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const unmarkedStore = store({
          name: "unmarked",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const app = container({
          middleware: forStores([
            persist({
              // persistedOnly defaults to false
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const instance = app.get(unmarkedStore);

        // Load should be called even without persisted meta
        expect(load).toHaveBeenCalledTimes(1);

        // State should be hydrated
        expect(instance.state.count).toBe(42);

        // Changes should trigger save
        instance.actions.increment();
        expect(save).toHaveBeenCalled();
      });
    });

    describe("filter option after persistedOnly", () => {
      it("should apply filter after persistedOnly check", () => {
        const load = vi.fn().mockReturnValue({ count: 42 });
        const save = vi.fn();

        const allowedStore = store({
          name: "allowed",
          state: { count: 0 },
          setup: () => ({}),
          meta: [persisted()],
        });

        const filteredStore = store({
          name: "filtered",
          state: { count: 0 },
          setup: () => ({}),
          meta: [persisted()],
        });

        const app = container({
          middleware: forStores([
            persist({
              persistedOnly: true,
              filter: (ctx) => ctx.displayName === "allowed",
              handler: () => ({ load, save }),
            }),
          ]),
        });

        const allowedInstance = app.get(allowedStore);
        const filteredInstance = app.get(filteredStore);

        // Both have persisted() but only "allowed" passes filter
        expect(allowedInstance.state.count).toBe(42);
        expect(filteredInstance.state.count).toBe(0);

        // load should only be called for allowed store
        expect(load).toHaveBeenCalledTimes(1);
      });
    });
  });
});
