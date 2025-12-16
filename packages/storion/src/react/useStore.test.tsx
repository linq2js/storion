/**
 * Tests for useStore hook.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { wrappers } from "./strictMode";
import { StoreProvider } from "./context";
import { useStore } from "./useStore";
import { store } from "../core/store";
import { container } from "../core/container";
import { untrack } from "../core/tracking";
import { SelectorContext, StoreSpec } from "../types";

describe.each(wrappers)("useStore ($mode mode)", ({ render, renderHook }) => {
  // Helper to create wrapper with container
  const createWrapper = (stores: ReturnType<typeof container>) => {
    return ({ children }: { children: React.ReactNode }) => (
      <StoreProvider container={stores}>{children}</StoreProvider>
    );
  };

  describe("basic usage", () => {
    it("should select state from store", () => {
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

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state] = get(counter);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.count).toBe(0);
    });

    it("should select actions from store", () => {
      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const stores = container();

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state, actions] = get(counter);
            return {
              count: state.count,
              increment: () => actions.increment(),
            };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(typeof result.current.increment).toBe("function");
    });

    it("should access multiple stores", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const user = store({
        state: { name: "Alice" },
        setup: () => ({}),
      });

      const stores = container();

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [counterState] = get(counter);
            const [userState] = get(user);
            return {
              count: counterState.count,
              name: userState.name,
            };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.count).toBe(0);
      expect(result.current.name).toBe("Alice");
    });
  });

  describe("subscription optimization", () => {
    it("should not re-subscribe when tracked keys are the same", () => {
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

      // Spy on _subscribeInternal (used internally via ReadEvent.subscribe)
      const subscribeSpy = vi.spyOn(instance, "_subscribeInternal");

      const { rerender } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state] = get(counter);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      // Get initial call count (may vary in StrictMode)
      const initialCalls = subscribeSpy.mock.calls.length;
      expect(initialCalls).toBeGreaterThan(0);

      // Re-render without changing tracked keys
      rerender();
      rerender();
      rerender();

      // Should not have any new subscriptions (same token)
      expect(subscribeSpy).toHaveBeenCalledTimes(initialCalls);

      subscribeSpy.mockRestore();
    });

    it("should subscribe to new props when tracked keys change", () => {
      const user = store({
        state: { name: "Alice", age: 30, city: "NYC" },
        setup: () => ({}),
      });

      const stores = container();
      const instance = stores.get(user);
      // Now we use _subscribeInternal directly via ReadEvent.subscribe
      const subscribeSpy = vi.spyOn(instance, "_subscribeInternal");

      let trackCity = false;

      const { rerender } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state] = get(user);
            const result: Record<string, unknown> = { name: state.name };
            if (trackCity) {
              result.city = state.city;
            }
            return result;
          }),
        { wrapper: createWrapper(stores) }
      );

      // Initial: only 'name' tracked
      expect(subscribeSpy).toHaveBeenCalledWith("name", expect.any(Function));

      // Now track 'city' too
      subscribeSpy.mockClear();
      trackCity = true;
      rerender();

      // Should subscribe to 'city' (may also re-sub to 'name' in StrictMode cleanup)
      expect(subscribeSpy).toHaveBeenCalledWith("city", expect.any(Function));

      subscribeSpy.mockRestore();
    });
  });

  describe("stable functions", () => {
    it("should return stable function references", () => {
      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const stores = container();

      const { result, rerender } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state, actions] = get(counter);
            return {
              count: state.count,
              increment: () => actions.increment(),
            };
          }),
        { wrapper: createWrapper(stores) }
      );

      const firstIncrement = result.current.increment;

      rerender();

      // Function reference should be stable
      expect(result.current.increment).toBe(firstIncrement);
    });

    it("should call the latest selector function", () => {
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

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state, storeActions] = get(counter);
            return {
              count: state.count,
              increment: () => storeActions.increment(),
            };
          }),
        { wrapper: createWrapper(stores) }
      );

      // Call increment through stable function
      act(() => {
        result.current.increment();
      });

      // State should be updated
      expect(instance.state.count).toBe(1);
    });
  });

  describe("conditional access", () => {
    it("should support conditional store access", () => {
      const user = store({
        state: { name: "Alice" },
        setup: () => ({}),
      });

      const stores = container();
      let enabled = false;

      const { result, rerender } = renderHook(
        () =>
          useStore(({ get }) => {
            if (!enabled) {
              return { data: null };
            }
            const [state] = get(user);
            return { data: state.name };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.data).toBeNull();

      enabled = true;
      rerender();

      expect(result.current.data).toBe("Alice");
    });
  });

  describe("store-level equality", () => {
    it("should use store config equality for property updates", () => {
      const user = store({
        state: { profile: { name: "Alice", age: 30 } },
        equality: { profile: "deep" },
        setup: () => ({}),
      });

      const stores = container();

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state] = get(user);
            return { profile: state.profile };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.profile).toEqual({ name: "Alice", age: 30 });
    });
  });

  describe("untrack in selectors", () => {
    it("should not subscribe to properties accessed inside untrack()", () => {
      const renderCount = vi.fn();

      const counter = store({
        state: { tracked: 0, untracked: 0 },
        setup: ({ state }) => ({
          incrementTracked: () => {
            state.tracked++;
          },
          incrementUntracked: () => {
            state.untracked++;
          },
        }),
      });

      const stores = container();

      const { result } = renderHook(
        () => {
          renderCount();
          return useStore(({ get }) => {
            const [state, actions] = get(counter);
            return {
              // This IS tracked
              tracked: state.tracked,
              // This is NOT tracked
              untracked: untrack(() => state.untracked),
              incrementTracked: actions.incrementTracked,
              incrementUntracked: actions.incrementUntracked,
            };
          });
        },
        { wrapper: createWrapper(stores) }
      );

      // Initial render
      expect(result.current.tracked).toBe(0);
      expect(result.current.untracked).toBe(0);
      renderCount.mockClear();

      // Change tracked value - should re-render
      act(() => {
        result.current.incrementTracked();
      });
      expect(result.current.tracked).toBe(1);
      expect(renderCount).toHaveBeenCalled();
      renderCount.mockClear();

      // Change untracked value - should NOT re-render
      act(() => {
        result.current.incrementUntracked();
      });
      expect(renderCount).not.toHaveBeenCalled();

      // Value is stale until next render
      expect(result.current.untracked).toBe(0); // Still 0 (stale)

      // After triggering re-render via tracked change, untracked updates
      act(() => {
        result.current.incrementTracked();
      });
      expect(result.current.tracked).toBe(2);
      expect(result.current.untracked).toBe(1); // Now updated
    });

    it("should work with nested untrack calls", () => {
      const counter = store({
        state: { a: 1, b: 2, c: 3 },
        setup: () => ({}),
      });

      const stores = container();

      const { result } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state] = get(counter);
            return {
              tracked: state.a,
              untracked: untrack(() => {
                // Nested access - none should be tracked
                return state.b + state.c;
              }),
            };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.tracked).toBe(1);
      expect(result.current.untracked).toBe(5);
    });
  });

  describe("component integration", () => {
    it("should work in React components", () => {
      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const stores = container();

      function Counter() {
        const { count, increment } = useStore(({ get }) => {
          const [state, actions] = get(counter);
          return {
            count: state.count,
            increment: () => actions.increment(),
          };
        });

        return (
          <div>
            <span data-testid="count">{count}</span>
            <button onClick={increment}>Increment</button>
          </div>
        );
      }

      const { getByTestId, getByText } = render(
        <StoreProvider container={stores}>
          <Counter />
        </StoreProvider>
      );

      expect(getByTestId("count").textContent).toBe("0");

      act(() => {
        getByText("Increment").click();
      });

      // Note: Component won't automatically re-render without subscription
      // This tests the action invocation works correctly
      const instance = stores.get(counter);
      expect(instance.state.count).toBe(1);
    });
  });

  describe("array results", () => {
    it("should preserve array structure in result", () => {
      const counter = store({
        state: { count: 5 },
        setup: () => ({
          increment() {},
        }),
      });

      const stores = container();

      const { result: hookResult } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state, actions] = get(counter);
            return [state.count, actions.increment] as const;
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(Array.isArray(hookResult.current)).toBe(true);
      expect(hookResult.current[0]).toBe(5);
      expect(typeof hookResult.current[1]).toBe("function");
    });

    it("should support tuple-like [state, actions] pattern", () => {
      const counter = store({
        state: { count: 0, name: "test" },
        setup: () => ({
          increment() {},
          setName() {},
        }),
      });

      const stores = container();

      const { result: hookResult } = renderHook(
        () =>
          useStore(({ get }) => {
            const [state, actions] = get(counter);
            return [
              { count: state.count, name: state.name },
              { increment: actions.increment, setName: actions.setName },
            ] as const;
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(Array.isArray(hookResult.current)).toBe(true);
      expect(hookResult.current[0]).toEqual({ count: 0, name: "test" });
      expect(typeof hookResult.current[1].increment).toBe("function");
    });
  });

  describe("error handling", () => {
    it("should throw when used outside provider", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() =>
          useStore(({ get }) => {
            const [state] = get(counter);
            return { count: state.count };
          })
        );
      }).toThrow("useContainer must be used within a StoreProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("async selector prevention", () => {
    it("should throw if selector returns a Promise", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(
          () =>
            useStore(async ({ get }) => {
              const [state] = get(counter);
              return { count: state.count };
            }),
          {
            wrapper: createWrapper(stores),
          }
        );
      }).toThrow(/useStore selector must be synchronous/);

      consoleSpy.mockRestore();
    });

    it("should throw if selector returns a PromiseLike", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(
          () =>
            useStore(({ get }) => {
              const [state] = get(counter);
              return { then: () => {}, count: state.count };
            }),
          {
            wrapper: createWrapper(stores),
          }
        );
      }).toThrow(/useStore selector must be synchronous/);

      consoleSpy.mockRestore();
    });
  });

  describe("SelectorContext.use()", () => {
    it("should use a mixin to compose selector logic", () => {
      const counter = store({
        state: { count: 5 },
        setup: () => ({}),
      });

      const doubledMixin = (
        ctx: SelectorContext,
        counterSpec: typeof counter
      ) => {
        const [state] = ctx.get(counterSpec);
        return state.count * 2;
      };

      const stores = container();
      stores.get(counter);

      const { result } = renderHook(
        () =>
          useStore((ctx) => {
            const doubled = ctx.use(doubledMixin, counter);
            return { doubled };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.doubled).toBe(10);
    });

    it("should compose multiple selector mixins", () => {
      const store1 = store({
        state: { value: 10 },
        setup: () => ({}),
      });

      const store2 = store({
        state: { value: 20 },
        setup: () => ({}),
      });

      const sumMixin = (
        ctx: SelectorContext,
        specs: StoreSpec<{ value: number }>[]
      ) => {
        return specs.reduce((sum, spec) => {
          const [state] = ctx.get(spec);
          return sum + state.value;
        }, 0);
      };

      const stores = container();
      stores.get(store1);
      stores.get(store2);

      const { result } = renderHook(
        () =>
          useStore((ctx) => {
            const total = ctx.use(sumMixin, [store1, store2]);
            return { total };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.total).toBe(30);
    });

    it("should track dependencies through mixin", () => {
      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const countMixin = (ctx: SelectorContext, spec: typeof counter) => {
        const [state] = ctx.get(spec);
        return state.count;
      };

      const stores = container();
      const counterInstance = stores.get(counter);

      const { result, rerender } = renderHook(
        () =>
          useStore((ctx) => {
            const count = ctx.use(countMixin, counter);
            return { count };
          }),
        { wrapper: createWrapper(stores) }
      );

      expect(result.current.count).toBe(0);

      act(() => {
        counterInstance.actions.increment();
      });
      rerender();

      expect(result.current.count).toBe(1);
    });
  });

  describe("SelectorContext.id", () => {
    it("should provide stable unique id per component instance", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      stores.get(counter);

      const { result, rerender } = renderHook(
        () =>
          useStore(({ get, id }) => {
            const [state] = get(counter);
            return { count: state.count, id };
          }),
        { wrapper: createWrapper(stores) }
      );

      // Capture the id after initial mount
      const firstId = result.current.id;
      expect(firstId).toBeDefined();
      expect(typeof firstId).toBe("object");

      // Re-render multiple times and verify id is stable
      rerender();
      expect(result.current.id).toBe(firstId);

      rerender();
      expect(result.current.id).toBe(firstId);

      rerender();
      expect(result.current.id).toBe(firstId);
    });

    it("should provide different id for different component instances", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      stores.get(counter);

      let id1: object | undefined;
      let id2: object | undefined;

      const { unmount: unmount1 } = renderHook(
        () =>
          useStore(({ get, id }) => {
            id1 = id;
            const [state] = get(counter);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      const { unmount: unmount2 } = renderHook(
        () =>
          useStore(({ get, id }) => {
            id2 = id;
            const [state] = get(counter);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      // Different component instances should have different ids
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);

      unmount1();
      unmount2();
    });
  });

  describe("SelectorContext.once()", () => {
    it("should run callback once on mount", () => {
      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const stores = container();
      const counterInstance = stores.get(counter);

      const onceCallback = vi.fn();

      const { rerender } = renderHook(
        () =>
          useStore(({ get, once }) => {
            const [state] = get(counter);
            once(onceCallback);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      // once callback should be called on mount
      // In strict mode, component mounts twice (intentional by React)
      const initialCallCount = onceCallback.mock.calls.length;
      expect(initialCallCount).toBeGreaterThanOrEqual(1);

      // Re-render multiple times
      rerender();
      rerender();

      // Should not increase
      expect(onceCallback).toHaveBeenCalledTimes(initialCallCount);

      // Trigger state change and re-render
      act(() => {
        counterInstance.actions.increment();
      });
      rerender();

      // Still same count
      expect(onceCallback).toHaveBeenCalledTimes(initialCallCount);
    });


    it("should run multiple once callbacks", () => {
      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      stores.get(counter);

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const { rerender } = renderHook(
        () =>
          useStore(({ get, once }) => {
            const [state] = get(counter);
            once(callback1);
            once(callback2);
            once(callback3);
            return { count: state.count };
          }),
        { wrapper: createWrapper(stores) }
      );

      // All callbacks should run on mount
      // In strict mode, they may run twice (once per mount)
      const initialCount = callback1.mock.calls.length;
      expect(initialCount).toBeGreaterThanOrEqual(1);
      expect(callback2).toHaveBeenCalledTimes(initialCount);
      expect(callback3).toHaveBeenCalledTimes(initialCount);

      // Re-render should not run callbacks again
      rerender();
      expect(callback1).toHaveBeenCalledTimes(initialCount);
      expect(callback2).toHaveBeenCalledTimes(initialCount);
      expect(callback3).toHaveBeenCalledTimes(initialCount);
    });
  });
});
