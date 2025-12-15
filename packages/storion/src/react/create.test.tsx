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

