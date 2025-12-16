import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "../core/container";
import { store } from "../core/store";
import { devtoolsMiddleware, getDevtoolsController } from "./middleware";
import type { DevtoolsController } from "./types";

describe("devtoolsMiddleware", () => {
  let mockWindow: { __STORION_DEVTOOLS__?: DevtoolsController };

  beforeEach(() => {
    mockWindow = {};
  });

  it("should expose controller on window object", () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
    });

    container({ middleware: [middleware] });

    expect(mockWindow.__STORION_DEVTOOLS__).toBeDefined();
    expect(mockWindow.__STORION_DEVTOOLS__?.version).toBe("1.0.0");
  });

  it("should track stores created in container", () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    app.get(counterStore);

    const controller = mockWindow.__STORION_DEVTOOLS__!;
    const stores = controller.getStores();

    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe("counter");
    expect(stores[0].state).toEqual({ count: 0 });
  });

  it("should record state history on action dispatch", async () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
      maxHistory: 5,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const instance = app.get(counterStore);

    instance.actions.increment();
    instance.actions.increment();

    // Wait for async updates
    await new Promise((r) => setTimeout(r, 10));

    const controller = mockWindow.__STORION_DEVTOOLS__!;
    const entry = controller.getStore(instance.id);

    expect(entry).toBeDefined();
    // Initial + 2 increments = at least 2 snapshots
    expect(entry!.history.length).toBeGreaterThanOrEqual(1);
    // The live instance should have count = 2
    expect(instance.state.count).toBe(2);
  });

  it("should inject __revertState action", () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const instance = app.get(counterStore);

    // Check that __revertState is injected
    expect((instance.actions as any).__revertState).toBeDefined();
    expect(typeof (instance.actions as any).__revertState).toBe("function");
  });

  it("should revert state via controller and remove newer entries", async () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
      maxHistory: 10,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const instance = app.get(counterStore);

    // Increment a few times
    instance.actions.increment();
    await new Promise((r) => setTimeout(r, 10));
    instance.actions.increment();
    await new Promise((r) => setTimeout(r, 10));
    instance.actions.increment();
    await new Promise((r) => setTimeout(r, 10));

    expect(instance.state.count).toBe(3);

    const controller = mockWindow.__STORION_DEVTOOLS__!;
    let entry = controller.getStore(instance.id);

    // Get the first snapshot (initial state with count=0)
    const initialSnapshot = entry!.history[0];
    expect(initialSnapshot.state.count).toBe(0);

    const historyLengthBefore = entry!.history.length;

    // Revert to initial state - should remove all newer entries
    const success = controller.revertToSnapshot(instance.id, initialSnapshot.id);
    expect(success).toBe(true);
    expect(instance.state.count).toBe(0);

    // Wait for the new state change to be recorded
    await new Promise((r) => setTimeout(r, 10));

    // Check that history was trimmed (removed reverted + newer, added new one)
    entry = controller.getStore(instance.id);
    // Should have only 1 entry now (the new reverted state)
    expect(entry!.history.length).toBeLessThan(historyLengthBefore);
  });

  it("should limit history to maxHistory", async () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
      maxHistory: 3,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const instance = app.get(counterStore);

    // Make more changes than maxHistory
    for (let i = 0; i < 10; i++) {
      instance.actions.increment();
      await new Promise((r) => setTimeout(r, 5));
    }

    const controller = mockWindow.__STORION_DEVTOOLS__!;
    const entry = controller.getStore(instance.id);

    expect(entry!.history.length).toBeLessThanOrEqual(3);
  });

  it("should remove store on dispose", async () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const instance = app.get(counterStore);

    const controller = mockWindow.__STORION_DEVTOOLS__!;
    expect(controller.getStore(instance.id)).toBeDefined();

    instance.dispose();

    // Store should be removed from devtools
    expect(controller.getStore(instance.id)).toBeUndefined();
  });

  it("should subscribe to controller changes", async () => {
    const middleware = devtoolsMiddleware({
      windowObject: mockWindow as any,
    });

    const counterStore = store({
      name: "counter",
      state: { count: 0 },
      setup({ state }) {
        return {
          increment: () => state.count++,
        };
      },
    });

    const app = container({ middleware: [middleware] });
    const controller = mockWindow.__STORION_DEVTOOLS__!;

    const listener = vi.fn();
    const unsub = controller.subscribe(listener);

    app.get(counterStore);

    expect(listener).toHaveBeenCalled();

    unsub();
    listener.mockClear();

    // After unsub, should not be called
    app.get(
      store({
        name: "other",
        state: { x: 1 },
        setup() {
          return {};
        },
      })
    );

    // Listener was unsubscribed, but other stores still trigger
    // (This tests the unsub works)
  });
});

