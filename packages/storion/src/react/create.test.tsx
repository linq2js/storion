/**
 * Tests for create() shorthand
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { create } from "./create";

describe("create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("instance", () => {
    it("should return a store instance", () => {
      const [counter] = create({
        state: { count: 0 },
        setup() {
          return {};
        },
      });

      expect(counter).toBeDefined();
      expect(counter.id).toBeDefined();
      expect(counter.state).toEqual({ count: 0 });
      expect(counter.actions).toEqual({});
    });

    it("should have working actions on instance", () => {
      const [counter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
            add(n: number) {
              state.count += n;
            },
          };
        },
      });

      expect(counter.state.count).toBe(0);

      counter.actions.increment();
      expect(counter.state.count).toBe(1);

      counter.actions.add(5);
      expect(counter.state.count).toBe(6);
    });

    it("should support subscribe on instance", () => {
      const [counter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const listener = vi.fn();
      const unsub = counter.subscribe("count", listener);

      counter.actions.increment();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ next: 1, prev: 0 });

      unsub();
      counter.actions.increment();
      expect(listener).toHaveBeenCalledTimes(1); // No additional call
    });
  });

  describe("hook", () => {
    it("should return a working hook", () => {
      const [, useCounter] = create({
        state: { count: 0 },
        setup() {
          return {};
        },
      });

      function TestComponent() {
        const { count } = useCounter((state) => ({ count: state.count }));
        return <div data-testid="count">{count}</div>;
      }

      render(<TestComponent />);
      expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("should re-render when state changes", async () => {
      const [counter, useCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const renderCount = vi.fn();

      function TestComponent() {
        renderCount();
        const { count } = useCounter((state) => ({ count: state.count }));
        return <div data-testid="count">{count}</div>;
      }

      render(<TestComponent />);
      expect(screen.getByTestId("count").textContent).toBe("0");
      expect(renderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        counter.actions.increment();
      });

      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(renderCount).toHaveBeenCalledTimes(2);
    });

    it("should provide actions in selector", async () => {
      const [, useCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      function TestComponent() {
        const { count, increment } = useCounter((state, actions) => ({
          count: state.count,
          increment: actions.increment,
        }));
        return (
          <button data-testid="btn" onClick={increment}>
            {count}
          </button>
        );
      }

      render(<TestComponent />);
      expect(screen.getByTestId("btn").textContent).toBe("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
      });

      expect(screen.getByTestId("btn").textContent).toBe("1");
    });

    it("should not re-render when unrelated state changes", async () => {
      const [counter, useCounter] = create({
        state: { count: 0, name: "test" },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
            setName(name: string) {
              state.name = name;
            },
          };
        },
      });

      const renderCount = vi.fn();

      function TestComponent() {
        renderCount();
        const { count } = useCounter((state) => ({ count: state.count }));
        return <div data-testid="count">{count}</div>;
      }

      render(<TestComponent />);
      expect(renderCount).toHaveBeenCalledTimes(1);

      // Change unrelated state
      await act(async () => {
        counter.actions.setName("updated");
      });

      // Should not re-render
      expect(renderCount).toHaveBeenCalledTimes(1);

      // Change related state
      await act(async () => {
        counter.actions.increment();
      });

      // Should re-render
      expect(renderCount).toHaveBeenCalledTimes(2);
    });

    it("should work without StoreProvider", () => {
      const [, useCounter] = create({
        state: { count: 42 },
        setup() {
          return {};
        },
      });

      function TestComponent() {
        const { count } = useCounter((state) => ({ count: state.count }));
        return <div data-testid="count">{count}</div>;
      }

      // No provider wrapper - should still work
      render(<TestComponent />);
      expect(screen.getByTestId("count").textContent).toBe("42");
    });
  });

  describe("containerOptions", () => {
    it("should accept middleware in containerOptions", () => {
      const middlewareCalls: string[] = [];

      const [counter] = create(
        {
          name: "test-counter",
          state: { count: 0 },
          setup({ state }) {
            return {
              increment() {
                state.count++;
              },
            };
          },
        },
        {
          middleware: [
            (ctx) => {
              middlewareCalls.push(
                ctx.type === "store" ? ctx.spec.displayName : "factory"
              );
              return ctx.next();
            },
          ],
        }
      );

      expect(counter.state.count).toBe(0);
      expect(middlewareCalls).toContain("test-counter");
    });

    it("should work with persist-like middleware pattern", async () => {
      const savedStates: Record<string, unknown>[] = [];
      let loadedState: Record<string, unknown> | null = { count: 42 };

      const mockPersist = () => {
        return (ctx: { type: string; next: () => unknown }) => {
          const instance = ctx.next();
          if (
            ctx.type === "store" &&
            instance &&
            typeof instance === "object" &&
            "hydrate" in instance &&
            "subscribe" in instance &&
            "dehydrate" in instance
          ) {
            const store = instance as {
              hydrate: (data: Record<string, unknown>) => void;
              subscribe: (listener: () => void) => () => void;
              dehydrate: () => Record<string, unknown>;
            };

            // Hydrate from "storage"
            if (loadedState) {
              store.hydrate(loadedState);
            }

            // Subscribe to save
            store.subscribe(() => {
              savedStates.push(store.dehydrate());
            });
          }
          return instance;
        };
      };

      const [counter] = create(
        {
          name: "persisted-counter",
          state: { count: 0 },
          setup({ state }) {
            return {
              increment() {
                state.count++;
              },
            };
          },
        },
        {
          middleware: [mockPersist()],
        }
      );

      // Should be hydrated with loaded state
      expect(counter.state.count).toBe(42);

      // State change should trigger save
      counter.actions.increment();
      expect(savedStates.length).toBe(1);
      expect(savedStates[0]).toEqual({ count: 43 });
    });

    it("should work without containerOptions (backwards compatible)", () => {
      const [counter] = create({
        state: { count: 0 },
        setup() {
          return {};
        },
      });

      expect(counter.state.count).toBe(0);
    });

    it("should work with empty containerOptions", () => {
      const [counter] = create(
        {
          state: { count: 0 },
          setup() {
            return {};
          },
        },
        {}
      );

      expect(counter.state.count).toBe(0);
    });
  });

  describe("withCreatedStore", () => {
    it("should return withStore as third tuple item", () => {
      const [, , withCounter] = create({
        state: { count: 0 },
        setup() {
          return {};
        },
      });

      expect(withCounter).toBeDefined();
      expect(typeof withCounter).toBe("function");
    });

    it("should work in direct mode", () => {
      const [, , withCounter] = create({
        state: { count: 0, name: "test" },
        setup() {
          return {};
        },
      });

      const Display = withCounter(
        ([state], _props: object) => ({
          count: state.count,
          name: state.name,
        }),
        ({ count, name }) => (
          <div data-testid="display">
            {name}: {count}
          </div>
        )
      );

      render(<Display />);
      expect(screen.getByTestId("display").textContent).toBe("test: 0");
    });

    it("should receive [state, actions] tuple in hook", async () => {
      const [counter, , withCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const Display = withCounter(
        ([state, actions]) => ({
          count: state.count,
          increment: actions.increment,
        }),
        ({ count, increment }) => (
          <button data-testid="btn" onClick={increment}>
            {count}
          </button>
        )
      );

      render(<Display />);
      expect(screen.getByTestId("btn").textContent).toBe("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
      });

      expect(screen.getByTestId("btn").textContent).toBe("1");
      expect(counter.state.count).toBe(1);
    });

    it("should re-render when state changes", async () => {
      const [counter, , withCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const renderCount = vi.fn();

      const Display = withCounter(
        ([state]) => {
          renderCount();
          return { count: state.count };
        },
        ({ count }) => <div data-testid="count">{count}</div>
      );

      render(<Display />);
      expect(screen.getByTestId("count").textContent).toBe("0");
      expect(renderCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        counter.actions.increment();
      });

      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(renderCount).toHaveBeenCalledTimes(2);
    });

    it("should work in HOC mode", async () => {
      const [counter, , withCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const withCounterData = withCounter(([state, actions]) => ({
        count: state.count,
        increment: actions.increment,
      }));

      const Display = withCounterData(({ count, increment }) => (
        <button data-testid="btn" onClick={increment}>
          {count}
        </button>
      ));

      render(<Display />);
      expect(screen.getByTestId("btn").textContent).toBe("0");

      await act(async () => {
        fireEvent.click(screen.getByTestId("btn"));
      });

      expect(screen.getByTestId("btn").textContent).toBe("1");
      expect(counter.state.count).toBe(1);
    });

    it("should receive props in hook", () => {
      const [, , withCounter] = create({
        state: { count: 10 },
        setup() {
          return {};
        },
      });

      const Display = withCounter(
        ([state], props: { multiplier: number }) => ({
          result: state.count * props.multiplier,
        }),
        ({ result }) => <div data-testid="result">{result}</div>
      );

      render(<Display multiplier={3} />);
      expect(screen.getByTestId("result").textContent).toBe("30");
    });

    it("should expose .use and .render for testing", () => {
      const [, , withCounter] = create({
        state: { count: 5 },
        setup() {
          return {};
        },
      });

      const Display = withCounter(
        ([state], _props: object) => ({ count: state.count }),
        ({ count }) => <span>{count}</span>
      );

      // Test hook
      expect(Display.use).toBeDefined();
      expect(typeof Display.use).toBe("function");

      // Test render
      expect(Display.render).toBeDefined();
      expect(typeof Display.render).toBe("function");
    });

    it("should not require StoreProvider", () => {
      const [, , withCounter] = create({
        state: { value: 42 },
        setup() {
          return {};
        },
      });

      const Display = withCounter(
        ([state]) => ({ value: state.value }),
        ({ value }) => <div data-testid="value">{value}</div>
      );

      // No StoreProvider - should work
      render(<Display />);
      expect(screen.getByTestId("value").textContent).toBe("42");
    });

    it("should track dependencies correctly (no re-render for unrelated state)", async () => {
      const [counter, , withCounter] = create({
        state: { count: 0, name: "test" },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
            setName(name: string) {
              state.name = name;
            },
          };
        },
      });

      const renderCount = vi.fn();

      const Display = withCounter(
        ([state]) => {
          renderCount();
          // Only track count, not name
          return { count: state.count };
        },
        ({ count }) => <div data-testid="count">{count}</div>
      );

      render(<Display />);
      expect(renderCount).toHaveBeenCalledTimes(1);

      // Change unrelated state
      await act(async () => {
        counter.actions.setName("updated");
      });

      // Should NOT re-render
      expect(renderCount).toHaveBeenCalledTimes(1);

      // Change tracked state
      await act(async () => {
        counter.actions.increment();
      });

      // Should re-render
      expect(renderCount).toHaveBeenCalledTimes(2);
    });
  });

  describe("isolation", () => {
    it("should create isolated instances for each create call", () => {
      const [counter1] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const [counter2] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      counter1.actions.increment();
      counter1.actions.increment();

      expect(counter1.state.count).toBe(2);
      expect(counter2.state.count).toBe(0); // Isolated
    });

    it("should share state between instance and hook", async () => {
      const [counter, useCounter] = create({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      function TestComponent() {
        const { count } = useCounter((state) => ({ count: state.count }));
        return <div data-testid="count">{count}</div>;
      }

      render(<TestComponent />);
      expect(screen.getByTestId("count").textContent).toBe("0");

      // Update via instance
      await act(async () => {
        counter.actions.increment();
      });

      // Hook should reflect change
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(counter.state.count).toBe(1);
    });
  });
});
