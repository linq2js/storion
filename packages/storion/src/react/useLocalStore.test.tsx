/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { StrictMode, useState, useEffect } from "react";
import { useLocalStore } from "./useLocalStore";
import { store } from "../core/store";

// Helper to wait for microtasks
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useLocalStore", () => {
  const counterSpec = store({
    name: "counter",
    state: { count: 0 },
    setup({ state }) {
      return {
        increment: () => {
          state.count++;
        },
        decrement: () => {
          state.count--;
        },
      };
    },
  });

  describe("basic functionality", () => {
    it("should create a local store and return [state, actions, utils]", () => {
      function Counter() {
        const [state, actions, utils] = useLocalStore(counterSpec);
        return (
          <div>
            <span data-testid="count">{state.count}</span>
            <span data-testid="has-dirty">{typeof utils.dirty}</span>
            <span data-testid="has-reset">{typeof utils.reset}</span>
          </div>
        );
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("0");
      expect(screen.getByTestId("has-dirty").textContent).toBe("function");
      expect(screen.getByTestId("has-reset").textContent).toBe("function");
    });

    it("should re-render on state changes", async () => {
      function Counter() {
        const [state, actions] = useLocalStore(counterSpec);
        return (
          <div>
            <span data-testid="count">{state.count}</span>
            <button onClick={actions.increment}>+</button>
          </div>
        );
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("0");

      act(() => {
        screen.getByText("+").click();
      });

      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    it("should create isolated instances per component", () => {
      function Counter({ id }: { id: string }) {
        const [state, actions] = useLocalStore(counterSpec);
        return (
          <div>
            <span data-testid={`count-${id}`}>{state.count}</span>
            <button data-testid={`btn-${id}`} onClick={actions.increment}>
              +
            </button>
          </div>
        );
      }

      render(
        <>
          <Counter id="a" />
          <Counter id="b" />
        </>
      );

      expect(screen.getByTestId("count-a").textContent).toBe("0");
      expect(screen.getByTestId("count-b").textContent).toBe("0");

      // Increment only counter A
      act(() => {
        screen.getByTestId("btn-a").click();
      });

      // Only A should be incremented
      expect(screen.getByTestId("count-a").textContent).toBe("1");
      expect(screen.getByTestId("count-b").textContent).toBe("0");
    });
  });

  describe("dirty and reset utilities", () => {
    it("should track dirty state", () => {
      function Counter() {
        const [state, actions, { dirty }] = useLocalStore(counterSpec);
        return (
          <div>
            <span data-testid="count">{state.count}</span>
            <span data-testid="dirty">{dirty() ? "yes" : "no"}</span>
            <button onClick={actions.increment}>+</button>
          </div>
        );
      }

      render(<Counter />);
      expect(screen.getByTestId("dirty").textContent).toBe("no");

      act(() => {
        screen.getByText("+").click();
      });

      expect(screen.getByTestId("dirty").textContent).toBe("yes");
    });

    it("should reset state to initial values", () => {
      function Counter() {
        const [state, actions, { dirty, reset }] = useLocalStore(counterSpec);
        return (
          <div>
            <span data-testid="count">{state.count}</span>
            <span data-testid="dirty">{dirty() ? "yes" : "no"}</span>
            <button onClick={actions.increment}>+</button>
            <button onClick={reset}>Reset</button>
          </div>
        );
      }

      render(<Counter />);

      // Increment a few times
      act(() => {
        screen.getByText("+").click();
        screen.getByText("+").click();
      });

      expect(screen.getByTestId("count").textContent).toBe("2");
      expect(screen.getByTestId("dirty").textContent).toBe("yes");

      // Reset
      act(() => {
        screen.getByText("Reset").click();
      });

      expect(screen.getByTestId("count").textContent).toBe("0");
      expect(screen.getByTestId("dirty").textContent).toBe("no");
    });
  });

  describe("StrictMode compatibility", () => {
    it("should work correctly with StrictMode double render", () => {
      let renderCount = 0;

      function Counter() {
        renderCount++;
        const [state] = useLocalStore(counterSpec);
        return <div data-testid="count">{state.count}</div>;
      }

      render(
        <StrictMode>
          <Counter />
        </StrictMode>
      );

      // StrictMode renders twice
      expect(renderCount).toBe(2);
      expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("should survive StrictMode effect cleanup and re-run", async () => {
      let effectCount = 0;
      let cleanupCount = 0;

      function Counter() {
        const [state] = useLocalStore(counterSpec);

        useEffect(() => {
          effectCount++;
          return () => {
            cleanupCount++;
          };
        }, []);

        return <div data-testid="count">{state.count}</div>;
      }

      render(
        <StrictMode>
          <Counter />
        </StrictMode>
      );

      // StrictMode runs effect, cleanup, effect
      expect(effectCount).toBe(2);
      expect(cleanupCount).toBe(1);

      // Store should still work
      expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("should preserve state through StrictMode remount", async () => {
      function Counter() {
        const [state, actions] = useLocalStore(counterSpec);

        // Increment on first effect only
        useEffect(() => {
          actions.increment();
        }, [actions]);

        return <div data-testid="count">{state.count}</div>;
      }

      render(
        <StrictMode>
          <Counter />
        </StrictMode>
      );

      // StrictMode runs effect twice, so count is incremented twice
      // This is expected behavior - effects run twice in StrictMode
      await waitFor(() => {
        expect(screen.getByTestId("count").textContent).toBe("2");
      });
    });
  });

  describe("cleanup on unmount", () => {
    it("should clean up store on unmount (state updates should not trigger re-render)", async () => {
      let lastActions: any = null;
      let renderCount = 0;

      function Counter() {
        renderCount++;
        const [state, actions] = useLocalStore(counterSpec);
        lastActions = actions;
        return <div data-testid="count">{state.count}</div>;
      }

      function App() {
        const [show, setShow] = useState(true);
        return (
          <>
            {show && <Counter />}
            <button onClick={() => setShow(false)}>Hide</button>
          </>
        );
      }

      render(<App />);
      const initialRenderCount = renderCount;
      expect(screen.getByTestId("count").textContent).toBe("0");

      // Unmount
      act(() => {
        screen.getByText("Hide").click();
      });

      // Wait for deferred disposal
      await flushMicrotasks();

      // Try to update state after unmount - should not cause errors or re-renders
      const renderCountBeforeUpdate = renderCount;
      act(() => {
        // This should be a no-op since store is disposed
        try {
          lastActions.increment();
        } catch {
          // Expected - store is disposed
        }
      });

      // No new renders should have occurred
      expect(renderCount).toBe(renderCountBeforeUpdate);
    });

    it("should dispose old store when spec changes", async () => {
      const specA = store({
        name: "specA",
        state: { value: "A" },
        setup() {
          return {};
        },
      });

      const specB = store({
        name: "specB",
        state: { value: "B" },
        setup() {
          return {};
        },
      });

      function Component({ spec }: { spec: typeof specA }) {
        const [state] = useLocalStore(spec);
        return <div data-testid="value">{state.value}</div>;
      }

      function App() {
        const [useB, setUseB] = useState(false);
        return (
          <>
            <Component spec={useB ? specB : specA} />
            <button onClick={() => setUseB(true)}>Switch</button>
          </>
        );
      }

      render(<App />);
      expect(screen.getByTestId("value").textContent).toBe("A");

      act(() => {
        screen.getByText("Switch").click();
      });

      expect(screen.getByTestId("value").textContent).toBe("B");
    });
  });

  describe("error handling", () => {
    it("should throw error if store has dependencies", () => {
      // Create a base spec that the dependent spec will resolve
      const baseSpec = store({
        name: "baseStoreForDeps",
        state: { value: 0 },
        setup() {
          return {};
        },
      });

      const dependentSpec = store({
        name: "dependentStore",
        state: { value: 0 },
        setup({ resolve }) {
          // This creates a dependency
          resolve(baseSpec);
          return {};
        },
      });

      function Component() {
        const [state] = useLocalStore(dependentSpec);
        return <div>{state.value}</div>;
      }

      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        render(<Component />);
      }).toThrow(/Local store must not have dependencies/);

      consoleSpy.mockRestore();
    });
  });
});
