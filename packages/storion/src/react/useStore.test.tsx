/**
 * Tests for useStore hook.
 */

import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { wrappers } from "./strictMode";
import { StoreProvider } from "./context";
import { useStore } from "./useStore";
import { store } from "../core/store";
import { container } from "../core/container";
import { untrack } from "../core/tracking";
import { SelectorContext, StoreSpec } from "../types";

describe.each(wrappers)(
  "useStore ($mode mode)",
  ({ mode, render, renderHook }) => {
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

      it("should accept void selector for side effects only", () => {
        const counter = store({
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const stores = container();
        const sideEffectRan = { value: false };

        const { result } = renderHook(
          () => {
            useStore(({ get }) => {
              const [state] = get(counter);
              // Side effect - just access the state, no return
              sideEffectRan.value = true;
              void state.count; // Access to track
            });
            return null;
          },
          { wrapper: createWrapper(stores) }
        );

        expect(sideEffectRan.value).toBe(true);
        expect(result.current).toBe(null);
      });
    });

    describe("subscription behavior", () => {
      it("should resubscribe on every render to catch hydration changes", () => {
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

        // Re-render - will resubscribe (by design for hydration support)
        rerender();
        rerender();
        rerender();

        // Each render causes resubscription (cleanup + subscribe)
        expect(subscribeSpy.mock.calls.length).toBeGreaterThan(initialCalls);

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

    describe("SelectorContext.mixin()", () => {
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
              const doubled = ctx.mixin(doubledMixin, counter);
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
              const total = ctx.mixin(sumMixin, [store1, store2]);
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
              const count = ctx.mixin(countMixin, counter);
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

      it("should support MergeMixin array syntax", () => {
        const userStore = store({
          name: "user",
          state: { name: "John", email: "john@example.com" },
          setup: () => ({}),
        });

        const counterStore = store({
          name: "counter",
          state: { count: 5 },
          setup: () => ({}),
        });

        const selectUser = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return { name: state.name, email: state.email };
        };

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.count;
        };

        const stores = container();
        stores.get(userStore);
        stores.get(counterStore);

        const { result } = renderHook(
          () =>
            useStore((ctx) => {
              // Use ctx.mixin with MergeMixin array
              return ctx.mixin([selectUser, { count: selectCount }]);
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.name).toBe("John");
        expect(result.current.email).toBe("john@example.com");
        expect(result.current.count).toBe(5);
      });

      it("should support MixinMap object syntax", () => {
        const userStore = store({
          name: "user",
          state: { name: "Alice", age: 30 },
          setup: () => ({}),
        });

        const selectName = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return state.name;
        };

        const selectAge = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return state.age;
        };

        const stores = container();
        stores.get(userStore);

        const { result } = renderHook(
          () =>
            useStore((ctx) => {
              // Use ctx.mixin with MixinMap object
              return ctx.mixin({ userName: selectName, userAge: selectAge });
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.userName).toBe("Alice");
        expect(result.current.userAge).toBe(30);
      });

      it("should track dependencies through MergeMixin", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return { count: state.count };
        };

        const stores = container();
        const counterInstance = stores.get(counterStore);

        const { result, rerender } = renderHook(
          () =>
            useStore((ctx) => {
              return ctx.mixin([selectCount]);
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

      it("should track dependencies through MixinMap", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.count;
        };

        const stores = container();
        const counterInstance = stores.get(counterStore);

        const { result, rerender } = renderHook(
          () =>
            useStore((ctx) => {
              return ctx.mixin({ count: selectCount });
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
        expect(typeof firstId).toBe("string");

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

        let id1: string | undefined;
        let id2: string | undefined;

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

    it("should support using hooks in selector", () => {
      const { result } = renderHook(
        () => {
          return useStore(() => {
            const [count, setCount] = useState(0);
            return { count, setCount };
          });
        },
        { wrapper: createWrapper(container()) }
      );

      expect(result.current.count).toBe(0);
      act(() => result.current.setCount(1));
    });

    describe("scoped()", () => {
      it("should create component-local store instance", () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: ({ state }) => ({
            setValue: (v: string) => {
              state.value = v;
            },
          }),
        });

        const stores = container();

        const { result } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [state, actions] = scoped(formStore);
              return { value: state.value, setValue: actions.setValue };
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.value).toBe("");

        act(() => {
          result.current.setValue("test");
        });

        expect(result.current.value).toBe("test");
      });

      it("should return instance as third tuple element", () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: () => ({}),
        });

        const stores = container();
        let capturedInstance: any;

        renderHook(
          () =>
            useStore(({ scoped }) => {
              const [, , instance] = scoped(formStore);
              capturedInstance = instance;
              return {};
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(capturedInstance).toBeDefined();
        expect(capturedInstance.state).toBeDefined();
        expect(capturedInstance.actions).toBeDefined();
        expect(capturedInstance.dispose).toBeDefined();
      });

      it("should dispose scoped stores on unmount", async () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: () => ({}),
        });

        const stores = container();
        let capturedInstance: any;

        const { unmount } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [, , instance] = scoped(formStore);
              capturedInstance = instance;
              return {};
            }),
          { wrapper: createWrapper(stores) }
        );

        const disposeSpy = vi.spyOn(capturedInstance, "dispose");

        unmount();

        // Wait for microtask to complete (StrictMode deferred disposal)
        await new Promise((resolve) => setTimeout(resolve, 10));

        // In strict mode, dispose may be called multiple times
        expect(disposeSpy).toHaveBeenCalled();
      });

      it("should isolate scoped stores between components", () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: ({ state }) => ({
            setValue: (v: string) => {
              state.value = v;
            },
          }),
        });

        const stores = container();
        const wrapper = createWrapper(stores);

        const { result: result1 } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [state, actions] = scoped(formStore);
              return { value: state.value, setValue: actions.setValue };
            }),
          { wrapper }
        );

        const { result: result2 } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [state, actions] = scoped(formStore);
              return { value: state.value, setValue: actions.setValue };
            }),
          { wrapper }
        );

        // Update first component
        act(() => {
          result1.current.setValue("component1");
        });

        // First component should be updated
        expect(result1.current.value).toBe("component1");

        // Second component should remain unchanged (isolated)
        expect(result2.current.value).toBe("");
      });

      it("should support multiple scoped stores in same selector", () => {
        const store1 = store({
          name: "store1",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const store2 = store({
          name: "store2",
          state: { name: "" },
          setup: ({ state }) => ({
            setName: (n: string) => {
              state.name = n;
            },
          }),
        });

        const stores = container();

        const { result } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [s1, a1] = scoped(store1);
              const [s2, a2] = scoped(store2);
              return {
                count: s1.count,
                name: s2.name,
                increment: a1.increment,
                setName: a2.setName,
              };
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(0);
        expect(result.current.name).toBe("");

        act(() => {
          result.current.increment();
          result.current.setName("test");
        });

        expect(result.current.count).toBe(1);
        expect(result.current.name).toBe("test");
      });

      it("should work alongside get() for global stores", () => {
        const globalStore = store({
          name: "global",
          state: { globalValue: "global" },
          setup: () => ({}),
        });

        const localStore = store({
          name: "local",
          state: { localValue: "" },
          setup: ({ state }) => ({
            setLocal: (v: string) => {
              state.localValue = v;
            },
          }),
        });

        const stores = container();

        const { result } = renderHook(
          () =>
            useStore(({ get, scoped }) => {
              const [globalState] = get(globalStore);
              const [localState, localActions] = scoped(localStore);
              return {
                globalValue: globalState.globalValue,
                localValue: localState.localValue,
                setLocal: localActions.setLocal,
              };
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.globalValue).toBe("global");
        expect(result.current.localValue).toBe("");

        act(() => {
          result.current.setLocal("updated");
        });

        expect(result.current.localValue).toBe("updated");
      });

      it("should throw when scoped() called outside selector", async () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: () => ({}),
        });

        const stores = container();
        let capturedScoped: any;

        renderHook(
          () =>
            useStore(({ scoped }) => {
              capturedScoped = scoped;
              return {};
            }),
          { wrapper: createWrapper(stores) }
        );

        // Calling scoped outside selector should throw
        expect(() => capturedScoped(formStore)).toThrow(
          /scoped\(\) can only be called during selector execution/
        );
      });

      it("should reuse same scoped instance across re-renders", () => {
        const formStore = store({
          name: "form",
          state: { value: "" },
          setup: () => ({}),
        });

        const stores = container();
        const instanceIds: string[] = [];

        const { rerender } = renderHook(
          () =>
            useStore(({ scoped }) => {
              const [, , instance] = scoped(formStore);
              instanceIds.push(instance.id);
              return {};
            }),
          { wrapper: createWrapper(stores) }
        );

        const initialCount = instanceIds.length;

        rerender();
        rerender();

        // After initial renders, re-renders should reuse the same instance
        // In strict mode, there may be 2 instances initially (mount/unmount/remount)
        // But subsequent re-renders should not create new instances
        const afterRerenderCount = instanceIds.length;
        const newInstancesAfterRerender = afterRerenderCount - initialCount;

        // Each rerender should use existing instance, not create new ones
        // Check that the last few IDs are the same
        const lastThreeIds = instanceIds.slice(-3);
        const uniqueLastIds = [...new Set(lastThreeIds)];
        expect(uniqueLastIds.length).toBe(1);
      });
    });

    describe("effect() in selector", () => {
      it("should run effect after render", async () => {
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
        const effectCalls: number[] = [];

        const { effect } = await import("../core/effect");

        renderHook(
          () =>
            useStore(({ get }) => {
              const [state] = get(counter);

              // Effect defined in selector - runs after render
              effect(() => {
                effectCalls.push(state.count);
              });

              return { count: state.count };
            }),
          { wrapper: createWrapper(stores) }
        );

        // Effect should have run after mount
        expect(effectCalls).toContain(0);
      });

      it("should cleanup effect on unmount", async () => {
        const counter = store({
          name: "counter",
          state: { count: 0 },
          setup: () => ({}),
        });

        const stores = container();
        const cleanupCalls: string[] = [];

        const { effect } = await import("../core/effect");

        const { unmount } = renderHook(
          () =>
            useStore(({ get }) => {
              const [state] = get(counter);

              effect((ctx) => {
                ctx.onCleanup(() => {
                  cleanupCalls.push("cleanup");
                });
              });

              return { count: state.count };
            }),
          { wrapper: createWrapper(stores) }
        );

        unmount();

        // Cleanup should have been called at least once
        // (In StrictMode: may be called multiple times due to mount/unmount cycles)
        expect(cleanupCalls.length).toBeGreaterThanOrEqual(1);
      });

      it("should have access to external values via closure", async () => {
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
        const capturedValues: Array<{ count: number; external: string }> = [];

        const { effect } = await import("../core/effect");

        const TestComponent = ({ externalProp }: { externalProp: string }) => {
          const { count, increment } = useStore(({ get }) => {
            const [state, actions] = get(counter);

            // Effect has closure over externalProp
            effect(() => {
              capturedValues.push({
                count: state.count,
                external: externalProp,
              });
            });

            return { count: state.count, increment: actions.increment };
          });

          return (
            <div>
              <span data-testid="count">{count}</span>
              <span data-testid="external">{externalProp}</span>
              <button onClick={increment}>Inc</button>
            </div>
          );
        };

        const Wrapper = ({ children }: { children: React.ReactNode }) => (
          <StoreProvider container={stores}>{children}</StoreProvider>
        );

        const { rerender } = render(
          <Wrapper>
            <TestComponent externalProp="initial" />
          </Wrapper>
        );

        // Should have captured initial values
        expect(capturedValues.some((v) => v.external === "initial")).toBe(true);

        // Rerender with new prop
        rerender(
          <Wrapper>
            <TestComponent externalProp="updated" />
          </Wrapper>
        );

        // Effect should have fresh closure with new prop value
        expect(capturedValues.some((v) => v.external === "updated")).toBe(true);
      });

      it("should re-run effect when tracked state changes", async () => {
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
        const effectCalls: number[] = [];

        const { effect } = await import("../core/effect");

        const { result } = renderHook(
          () =>
            useStore(({ get }) => {
              const [state, actions] = get(counter);

              effect(() => {
                // This tracks state.count
                effectCalls.push(state.count);
              });

              return { count: state.count, increment: actions.increment };
            }),
          { wrapper: createWrapper(stores) }
        );

        const initialCallCount = effectCalls.length;

        // Trigger state change
        act(() => {
          result.current.increment();
        });

        // Effect should have re-run with new count
        expect(effectCalls.length).toBeGreaterThan(initialCallCount);
        expect(effectCalls).toContain(1);
      });
    });

    describe("useStore.from()", () => {
      it("should create a pre-bound hook for a specific store", () => {
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
        const useCounter = useStore.from(counter);

        const { result } = renderHook(
          () =>
            useCounter((state, actions) => ({
              count: state.count,
              increment: actions.increment,
            })),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(0);

        act(() => {
          result.current.increment();
        });

        expect(result.current.count).toBe(1);
      });

      it("should provide access to context in third parameter", () => {
        const counter = store({
          name: "counter",
          state: { count: 0 },
          setup: () => ({}),
        });

        const user = store({
          name: "user",
          state: { name: "John" },
          setup: () => ({}),
        });

        const stores = container();
        const useCounter = useStore.from(counter);

        const { result } = renderHook(
          () =>
            useCounter((state, _actions, ctx) => {
              const [userState] = ctx.get(user);
              return {
                count: state.count,
                userName: userState.name,
              };
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(0);
        expect(result.current.userName).toBe("John");
      });

      it("should re-render when state changes", () => {
        const counter = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            setCount: (n: number) => {
              state.count = n;
            },
          }),
        });

        const stores = container();
        const useCounter = useStore.from(counter);

        let renderCount = 0;

        const { result } = renderHook(
          () => {
            renderCount++;
            return useCounter((state, actions) => ({
              count: state.count,
              setCount: actions.setCount,
            }));
          },
          { wrapper: createWrapper(stores) }
        );

        const initialRenderCount = renderCount;

        act(() => {
          result.current.setCount(5);
        });

        expect(result.current.count).toBe(5);
        // Re-render should have occurred (at least once, strict mode may render more)
        expect(renderCount).toBeGreaterThan(initialRenderCount);
      });

      it("should support scoped stores via context", () => {
        const formStore = store({
          name: "form",
          lifetime: "autoDispose",
          state: { value: "" },
          setup: ({ state }) => ({
            setValue: (v: string) => {
              state.value = v;
            },
          }),
        });

        const appStore = store({
          name: "app",
          state: { title: "My App" },
          setup: () => ({}),
        });

        const stores = container();
        const useApp = useStore.from(appStore);

        const { result } = renderHook(
          () =>
            useApp((state, _actions, ctx) => {
              const [formState, formActions] = ctx.scoped(formStore);
              return {
                title: state.title,
                formValue: formState.value,
                setFormValue: formActions.setValue,
              };
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.title).toBe("My App");
        expect(result.current.formValue).toBe("");

        act(() => {
          result.current.setFormValue("test input");
        });

        expect(result.current.formValue).toBe("test input");
      });

      it("should provide stable function references", () => {
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
        const useCounter = useStore.from(counter);

        const { result, rerender } = renderHook(
          () =>
            useCounter((state, actions) => ({
              count: state.count,
              increment: actions.increment,
            })),
          { wrapper: createWrapper(stores) }
        );

        const firstIncrement = result.current.increment;

        rerender();

        expect(result.current.increment).toBe(firstIncrement);
      });

      it("should support mixin via context", () => {
        const counter = store({
          name: "counter",
          state: { count: 0 },
          setup: () => ({}),
        });

        const stores = container();
        const useCounter = useStore.from(counter);

        const mockMixin = (ctx: SelectorContext, multiplier: number) => {
          const [state] = ctx.get(counter);
          return state.count * multiplier;
        };

        const { result } = renderHook(
          () =>
            useCounter((state, _actions, ctx) => ({
              count: state.count,
              doubled: ctx.mixin(mockMixin, 2),
            })),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(0);
        expect(result.current.doubled).toBe(0);
      });
    });

    describe("useStore.from() with selector function", () => {
      it("should create a parameterized hook from selector function", () => {
        const userStore = store({
          name: "users",
          state: {
            users: { "1": { name: "Alice" }, "2": { name: "Bob" } } as Record<
              string,
              { name: string }
            >,
          },
          setup: () => ({}),
        });

        const stores = container();

        const useUserById = useStore.from((ctx, userId: string) => {
          const [state] = ctx.get(userStore);
          return { user: state.users[userId] };
        });

        const { result } = renderHook(() => useUserById("1"), {
          wrapper: createWrapper(stores),
        });

        expect(result.current.user).toEqual({ name: "Alice" });
      });

      it("should support multiple arguments", () => {
        const dataStore = store({
          name: "data",
          state: {
            items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          },
          setup: () => ({}),
        });

        const stores = container();

        const usePaginatedItems = useStore.from(
          (ctx, page: number, pageSize: number) => {
            const [state] = ctx.get(dataStore);
            const start = page * pageSize;
            return { items: state.items.slice(start, start + pageSize) };
          }
        );

        const { result } = renderHook(() => usePaginatedItems(0, 3), {
          wrapper: createWrapper(stores),
        });

        expect(result.current.items).toEqual([1, 2, 3]);
      });

      it("should re-render when arguments change", () => {
        const userStore = store({
          name: "users",
          state: {
            users: { "1": { name: "Alice" }, "2": { name: "Bob" } } as Record<
              string,
              { name: string }
            >,
          },
          setup: () => ({}),
        });

        const stores = container();

        const useUserById = useStore.from((ctx, userId: string) => {
          const [state] = ctx.get(userStore);
          return { user: state.users[userId] };
        });

        const { result, rerender } = renderHook(
          ({ userId }) => useUserById(userId),
          {
            wrapper: createWrapper(stores),
            initialProps: { userId: "1" },
          }
        );

        expect(result.current.user).toEqual({ name: "Alice" });

        rerender({ userId: "2" });

        expect(result.current.user).toEqual({ name: "Bob" });
      });

      it("should re-render when state changes", () => {
        const counterStore = store({
          name: "counter",
          state: { counts: { a: 0, b: 0 } as Record<string, number> },
          setup: ({ state }) => ({
            increment: (key: string) => {
              state.counts = { ...state.counts, [key]: state.counts[key] + 1 };
            },
          }),
        });

        const stores = container();
        const instance = stores.get(counterStore);

        const useCountByKey = useStore.from((ctx, key: string) => {
          const [state] = ctx.get(counterStore);
          return { count: state.counts[key] };
        });

        const { result } = renderHook(() => useCountByKey("a"), {
          wrapper: createWrapper(stores),
        });

        expect(result.current.count).toBe(0);

        act(() => {
          instance.actions.increment("a");
        });

        expect(result.current.count).toBe(1);
      });

      it("should support zero arguments", () => {
        const counter = store({
          name: "counter",
          state: { count: 0 },
          setup: () => ({}),
        });

        const stores = container();

        const useCounterState = useStore.from((ctx) => {
          const [state] = ctx.get(counter);
          return { count: state.count };
        });

        const { result } = renderHook(() => useCounterState(), {
          wrapper: createWrapper(stores),
        });

        expect(result.current.count).toBe(0);
      });

      it("should provide stable function references", () => {
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

        const useCounterByMultiplier = useStore.from(
          (ctx, multiplier: number) => {
            const [state, actions] = ctx.get(counter);
            return {
              count: state.count * multiplier,
              increment: actions.increment,
            };
          }
        );

        const { result, rerender } = renderHook(
          ({ mult }) => useCounterByMultiplier(mult),
          {
            wrapper: createWrapper(stores),
            initialProps: { mult: 2 },
          }
        );

        const firstIncrement = result.current.increment;

        rerender({ mult: 2 });

        expect(result.current.increment).toBe(firstIncrement);
      });
    });

    describe("useStore(MergeMixin) - array of mixins", () => {
      it("should merge direct mixins that return objects", () => {
        const userStore = store({
          name: "user",
          state: { name: "John", age: 30 },
        });

        const profileStore = store({
          name: "profile",
          state: { bio: "Hello world" },
        });

        const stores = container();

        const selectUser = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return { name: state.name, age: state.age };
        };

        const selectProfile = (ctx: SelectorContext) => {
          const [state] = ctx.get(profileStore);
          return { bio: state.bio };
        };

        const { result } = renderHook(
          () => useStore([selectUser, selectProfile]),
          {
            wrapper: createWrapper(stores),
          }
        );

        expect(result.current.name).toBe("John");
        expect(result.current.age).toBe(30);
        expect(result.current.bio).toBe("Hello world");
      });

      it("should handle named mixins in array", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 5 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const stores = container();

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.count;
        };

        const selectIncrement = (ctx: SelectorContext) => {
          const [, actions] = ctx.get(counterStore);
          return actions.increment;
        };

        const { result } = renderHook(
          () =>
            useStore([{ count: selectCount }, { increment: selectIncrement }]),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(5);
        expect(typeof result.current.increment).toBe("function");

        act(() => {
          result.current.increment();
        });

        expect(result.current.count).toBe(6);
      });

      it("should merge direct and named mixins together", () => {
        const userStore = store({
          name: "user",
          state: { name: "Alice" },
        });

        const counterStore = store({
          name: "counter",
          state: { value: 10 },
        });

        const stores = container();

        const selectUser = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return { userName: state.name };
        };

        const selectCounter = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.value;
        };

        const { result } = renderHook(
          () => useStore([selectUser, { counter: selectCounter }]),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.userName).toBe("Alice");
        expect(result.current.counter).toBe(10);
      });

      it("should re-render when mixin dependencies change", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const stores = container();

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return { count: state.count };
        };

        const { result } = renderHook(() => useStore([selectCount]), {
          wrapper: createWrapper(stores),
        });

        expect(result.current.count).toBe(0);

        act(() => {
          stores.get(counterStore).actions.increment();
        });

        expect(result.current.count).toBe(1);
      });
    });

    describe("useStore(MixinMap) - object of mixins", () => {
      it("should map mixin keys to their results", () => {
        const userStore = store({
          name: "user",
          state: { name: "Bob", age: 25 },
        });

        const stores = container();

        const selectName = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return state.name;
        };

        const selectAge = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return state.age;
        };

        const { result } = renderHook(
          () =>
            useStore({
              userName: selectName,
              userAge: selectAge,
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.userName).toBe("Bob");
        expect(result.current.userAge).toBe(25);
      });

      it("should handle function-returning mixins", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
            decrement: () => {
              state.count--;
            },
          }),
        });

        const stores = container();

        const selectIncrement = (ctx: SelectorContext) => {
          const [, actions] = ctx.get(counterStore);
          return actions.increment;
        };

        const selectDecrement = (ctx: SelectorContext) => {
          const [, actions] = ctx.get(counterStore);
          return actions.decrement;
        };

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.count;
        };

        const { result } = renderHook(
          () =>
            useStore({
              inc: selectIncrement,
              dec: selectDecrement,
              count: selectCount,
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.count).toBe(0);

        act(() => {
          result.current.inc();
        });

        expect(result.current.count).toBe(1);

        act(() => {
          result.current.dec();
        });

        expect(result.current.count).toBe(0);
      });

      it("should re-render when mixin dependencies change", () => {
        const counterStore = store({
          name: "counter",
          state: { count: 0 },
          setup: ({ state }) => ({
            increment: () => {
              state.count++;
            },
          }),
        });

        const stores = container();

        const selectCount = (ctx: SelectorContext) => {
          const [state] = ctx.get(counterStore);
          return state.count;
        };

        const { result } = renderHook(
          () =>
            useStore({
              value: selectCount,
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.value).toBe(0);

        act(() => {
          stores.get(counterStore).actions.increment();
        });

        expect(result.current.value).toBe(1);
      });

      it("should handle object-returning mixins", () => {
        const userStore = store({
          name: "user",
          state: {
            profile: {
              firstName: "John",
              lastName: "Doe",
            },
          },
        });

        const stores = container();

        const selectProfile = (ctx: SelectorContext) => {
          const [state] = ctx.get(userStore);
          return state.profile;
        };

        const { result } = renderHook(
          () =>
            useStore({
              userProfile: selectProfile,
            }),
          { wrapper: createWrapper(stores) }
        );

        expect(result.current.userProfile.firstName).toBe("John");
        expect(result.current.userProfile.lastName).toBe("Doe");
      });
    });
  }
);
