/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React, {
  forwardRef,
  useRef,
  useEffect,
  useState,
  useMemo,
  type FC,
} from "react";
import { withStore } from "./withStore";
import { store } from "../core/store";
import { StoreProvider } from "./context";
import { container } from "../core/container";

describe("withStore", () => {
  const userStore = store({
    state: { name: "John", age: 30 },
    setup({ state }) {
      return {
        setName(name: string) {
          state.name = name;
        },
        setAge(age: number) {
          state.age = age;
        },
      };
    },
  });

  const root = container();

  beforeEach(() => {
    root.get(userStore).reset();
  });

  describe("Direct mode - no ref", () => {
    it("should render with hook output", () => {
      const UserProfile = withStore(
        (ctx, { userId }: { userId: string }) => {
          const [user] = ctx.get(userStore);
          return { name: user.name, age: user.age, userId };
        },
        ({ name, age, userId }) => (
          <div>
            <span data-testid="name">{name}</span>
            <span data-testid="age">{age}</span>
            <span data-testid="userId">{userId}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <UserProfile userId="123" />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
      expect(screen.getByTestId("age")).toHaveTextContent("30");
      expect(screen.getByTestId("userId")).toHaveTextContent("123");
    });

    it("should memoize render function", () => {
      const renderSpy = vi.fn();

      const Counter = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);
          return { name: user.name };
        },
        ({ name }) => {
          renderSpy(name);
          return <div data-testid="name">{name}</div>;
        }
      );

      const { rerender } = render(
        <StoreProvider container={root}>
          <Counter />
        </StoreProvider>
      );

      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalledWith("John");

      // Rerender with same props - render should not be called again
      rerender(
        <StoreProvider container={root}>
          <Counter />
        </StoreProvider>
      );

      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("should re-render when state changes", () => {
      const Counter = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);
          return { name: user.name };
        },
        ({ name }) => <div data-testid="name">{name}</div>
      );

      render(
        <StoreProvider container={root}>
          <Counter />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");

      // Change state
      act(() => {
        root.get(userStore).actions.setName("Jane");
      });

      expect(screen.getByTestId("name")).toHaveTextContent("Jane");
    });
  });

  describe("Direct mode - with ref", () => {
    it("should forward ref to render function", () => {
      const MyInput = withStore(
        (ctx, { defaultValue }: { defaultValue: string }) => {
          const [user] = ctx.get(userStore);
          return { value: user.name || defaultValue };
        },
        ({ value }, ref) => (
          <input ref={ref} data-testid="input" defaultValue={value} />
        )
      );

      const RefContainer = () => {
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, []);

        return (
          <StoreProvider container={root}>
            <MyInput ref={inputRef} defaultValue="test" />
          </StoreProvider>
        );
      };

      render(<RefContainer />);

      const input = screen.getByTestId("input") as HTMLInputElement;
      expect(input).toBe(document.activeElement);
      expect(input.defaultValue).toBe("John");
    });

    it("should detect ref support by function arity", () => {
      // Function with 2 parameters should be treated as having ref
      const renderWithRef = vi.fn(({ value }: { value: string }, ref: any) => (
        <input ref={ref} data-testid="input" value={value} readOnly />
      ));

      expect(renderWithRef.length).toBe(2);

      const Input = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { value: user.name };
      }, renderWithRef);

      const inputRef = { current: null };

      render(
        <StoreProvider container={root}>
          <Input ref={inputRef} />
        </StoreProvider>
      );

      expect(screen.getByTestId("input")).toHaveValue("John");
      expect(inputRef.current).toBe(screen.getByTestId("input"));
    });
  });

  describe("HOC mode - no ref", () => {
    it("should transform props using hook", () => {
      const withUserData = withStore((ctx, { filter }: { filter: string }) => {
        const [user] = ctx.get(userStore);
        return {
          name: user.name,
          isMatch: user.name.toLowerCase().includes(filter.toLowerCase()),
        };
      });

      const UserDisplay: FC<{ name: string; isMatch: boolean }> = ({
        name,
        isMatch,
      }) => (
        <div>
          <span data-testid="name">{name}</span>
          <span data-testid="match">{isMatch ? "yes" : "no"}</span>
        </div>
      );

      const ConnectedDisplay = withUserData(UserDisplay);

      render(
        <StoreProvider container={root}>
          <ConnectedDisplay filter="jo" />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
      expect(screen.getByTestId("match")).toHaveTextContent("yes");
    });

    it("should memoize component", () => {
      const componentSpy = vi.fn();

      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { name: user.name };
      });

      const UserDisplay: FC<{ name: string }> = ({ name }) => {
        componentSpy(name);
        return <div data-testid="name">{name}</div>;
      };

      const ConnectedDisplay = withUserData(UserDisplay);

      const { rerender } = render(
        <StoreProvider container={root}>
          <ConnectedDisplay />
        </StoreProvider>
      );

      expect(componentSpy).toHaveBeenCalledTimes(1);

      // Rerender with same props
      rerender(
        <StoreProvider container={root}>
          <ConnectedDisplay />
        </StoreProvider>
      );

      expect(componentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("HOC mode - with ref", () => {
    it("should forward ref to forwardRef component", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { value: user.name };
      });

      const InputComponent = forwardRef<HTMLInputElement, { value: string }>(
        ({ value }, ref) => (
          <input ref={ref} data-testid="input" defaultValue={value} />
        )
      );

      const ConnectedInput = withUserData(InputComponent);

      const RefContainer = () => {
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, []);

        return (
          <StoreProvider container={root}>
            <ConnectedInput ref={inputRef} />
          </StoreProvider>
        );
      };

      render(<RefContainer />);

      const input = screen.getByTestId("input") as HTMLInputElement;
      expect(input).toBe(document.activeElement);
      expect(input.defaultValue).toBe("John");
    });

    it("should detect ref support by component arity", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { value: user.name };
      });

      // Component with 2 parameters should be treated as having ref
      const ComponentWithRef = vi.fn(
        ({ value }: { value: string }, ref: any) => (
          <input ref={ref} data-testid="input" value={value} readOnly />
        )
      );

      expect(ComponentWithRef.length).toBe(2);

      const ConnectedInput = withUserData(ComponentWithRef);

      const inputRef = { current: null };

      render(
        <StoreProvider container={root}>
          <ConnectedInput ref={inputRef} />
        </StoreProvider>
      );

      expect(screen.getByTestId("input")).toHaveValue("John");
      expect(inputRef.current).toBe(screen.getByTestId("input"));
    });
  });

  describe("Empty props", () => {
    it("should work with empty input props (two-param hook)", () => {
      const Static = withStore(
        (ctx, {}: {}) => {
          const [user] = ctx.get(userStore);
          return { name: user.name };
        },
        ({ name }) => <div data-testid="name">{name}</div>
      );

      render(
        <StoreProvider container={root}>
          <Static />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
    });

    it("should work with single-param hook (context only)", () => {
      const Static = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);
          return { name: user.name };
        },
        ({ name }) => <div data-testid="name">{name}</div>
      );

      render(
        <StoreProvider container={root}>
          <Static />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
    });

    it("should work with no required props in HOC", () => {
      const withUserData = withStore((ctx, {}: {}) => {
        const [user] = ctx.get(userStore);
        return { name: user.name };
      });

      const Display: FC<{ name: string }> = ({ name }) => (
        <div data-testid="name">{name}</div>
      );

      const ConnectedDisplay = withUserData(Display);

      render(
        <StoreProvider container={root}>
          <ConnectedDisplay />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
    });

    it("should work with single-param hook in HOC mode", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { name: user.name };
      });

      const Display: FC<{ name: string }> = ({ name }) => (
        <div data-testid="name">{name}</div>
      );

      const ConnectedDisplay = withUserData(Display);

      render(
        <StoreProvider container={root}>
          <ConnectedDisplay />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
    });
  });

  describe("Multiple stores", () => {
    it("should access multiple stores in hook", () => {
      const counterStore = store({
        state: { count: 0 },
        setup({ state }) {
          return {
            increment() {
              state.count++;
            },
          };
        },
      });

      const Combined = withStore(
        (ctx, {}: {}) => {
          const [user] = ctx.get(userStore);
          const [counter] = ctx.get(counterStore);
          return { name: user.name, count: counter.count };
        },
        ({ name, count }) => (
          <div>
            <span data-testid="name">{name}</span>
            <span data-testid="count">{count}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Combined />
        </StoreProvider>
      );

      expect(screen.getByTestId("name")).toHaveTextContent("John");
      expect(screen.getByTestId("count")).toHaveTextContent("0");

      act(() => {
        root.get(counterStore).actions.increment();
      });

      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
  });

  describe("React hooks in hook", () => {
    it("should work with useState and returned functions", () => {
      const Component = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);
          const [localCount, setLocalCount] = useState(0);

          // ✅ CAN return functions that close over React hooks
          return {
            userName: user.name,
            localCount,
            increment: () => setLocalCount((c) => c + 1),
          };
        },
        ({ userName, localCount, increment }) => (
          <div>
            <span data-testid="userName">{userName}</span>
            <span data-testid="localCount">{localCount}</span>
            <button data-testid="increment" onClick={increment}>
              Increment
            </button>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(screen.getByTestId("userName")).toHaveTextContent("John");
      expect(screen.getByTestId("localCount")).toHaveTextContent("0");

      act(() => {
        screen.getByTestId("increment").click();
      });

      expect(screen.getByTestId("localCount")).toHaveTextContent("1");
    });

    it("should work with useEffect for side effects", () => {
      const effectSpy = vi.fn();

      const Component = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);

          useEffect(() => {
            effectSpy(user.name);
          }, [user.name]);

          return { name: user.name };
        },
        ({ name }) => <div data-testid="name">{name}</div>
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenCalledWith("John");

      act(() => {
        root.get(userStore).actions.setName("Jane");
      });

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenCalledWith("Jane");
    });

    it("should work with useMemo", () => {
      const memoSpy = vi.fn();

      const Component = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);

          const computedValue = useMemo(() => {
            memoSpy();
            return user.name.toUpperCase();
          }, [user.name]);

          return { name: user.name, upperName: computedValue };
        },
        ({ name, upperName }) => (
          <div>
            <span data-testid="name">{name}</span>
            <span data-testid="upperName">{upperName}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(memoSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("upperName")).toHaveTextContent("JOHN");

      act(() => {
        root.get(userStore).actions.setName("Jane");
      });

      expect(memoSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("upperName")).toHaveTextContent("JANE");
    });

    it("should work with custom hooks combining store and React hooks", () => {
      const useUserWithCounter = (ctx: any) => {
        const [user] = ctx.get(userStore);
        const [count, setCount] = useState(0);

        return {
          userName: user.name,
          count,
          increment: () => setCount((c) => c + 1),
        };
      };

      const Component = withStore(
        (ctx) => useUserWithCounter(ctx),
        ({ userName, count, increment }) => (
          <div>
            <span data-testid="userName">{userName}</span>
            <span data-testid="count">{count}</span>
            <button data-testid="increment" onClick={increment}>
              Increment
            </button>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(screen.getByTestId("userName")).toHaveTextContent("John");
      expect(screen.getByTestId("count")).toHaveTextContent("0");

      act(() => {
        screen.getByTestId("increment").click();
      });

      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    it("documents the pick() callback limitation", () => {
      // This test documents the only limitation with React hooks in withStore:
      // React hooks cannot be used inside pick() callbacks because pick creates
      // a Proxy tracking context that's not recognized by React.

      // ❌ INVALID (would throw "Invalid hook call"):
      // const value = pick(instance, state => {
      //   const [x] = useState(0);
      //   return state.value + x;
      // });

      // ✅ VALID: Use hooks outside, reference inside callback
      // const [x] = useState(0);
      // const value = pick(instance, state => state.value + x);

      expect(true).toBe(true); // Documentation test
    });
  });

  describe("Custom logic without React hooks", () => {
    it("should work with computed values", () => {
      const Component = withStore(
        (ctx) => {
          const [user] = ctx.get(userStore);
          // Pure computation (no React hooks)
          const upperName = user.name.toUpperCase();
          const isAdult = user.age >= 18;

          return { name: user.name, upperName, isAdult };
        },
        ({ name, upperName, isAdult }) => (
          <div>
            <span data-testid="name">{name}</span>
            <span data-testid="upperName">{upperName}</span>
            <span data-testid="isAdult">{isAdult ? "yes" : "no"}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(screen.getByTestId("upperName")).toHaveTextContent("JOHN");
      expect(screen.getByTestId("isAdult")).toHaveTextContent("yes");

      act(() => {
        root.get(userStore).actions.setName("Jane");
      });

      expect(screen.getByTestId("upperName")).toHaveTextContent("JANE");
    });

    it("should work with custom helper functions", () => {
      // Helper that only uses store access (no React hooks)
      const getUserDisplayInfo = (ctx: any) => {
        const [user] = ctx.get(userStore);
        return {
          displayName: `${user.name} (${user.age})`,
          category:
            user.age < 18 ? "minor" : user.age < 65 ? "adult" : "senior",
        };
      };

      const Component = withStore(
        (ctx) => getUserDisplayInfo(ctx),
        ({ displayName, category }) => (
          <div>
            <span data-testid="displayName">{displayName}</span>
            <span data-testid="category">{category}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component />
        </StoreProvider>
      );

      expect(screen.getByTestId("displayName")).toHaveTextContent("John (30)");
      expect(screen.getByTestId("category")).toHaveTextContent("adult");
    });

    it("should work with props-based computation", () => {
      const Component = withStore(
        (ctx, { multiplier }: { multiplier: number }) => {
          const [user] = ctx.get(userStore);
          const computed = user.age * multiplier;

          return {
            name: user.name,
            age: user.age,
            computed,
          };
        },
        ({ name, age, computed }) => (
          <div>
            <span data-testid="name">{name}</span>
            <span data-testid="age">{age}</span>
            <span data-testid="computed">{computed}</span>
          </div>
        )
      );

      render(
        <StoreProvider container={root}>
          <Component multiplier={2} />
        </StoreProvider>
      );

      expect(screen.getByTestId("computed")).toHaveTextContent("60"); // 30 * 2

      act(() => {
        root.get(userStore).actions.setAge(40);
      });

      expect(screen.getByTestId("computed")).toHaveTextContent("80"); // 40 * 2
    });
  });

  describe("DisplayName preservation", () => {
    it("should preserve displayName in HOC mode", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { name: user.name };
      });

      const UserDisplay: FC<{ name: string }> = ({ name }) => <div>{name}</div>;
      UserDisplay.displayName = "UserDisplay";

      const Connected = withUserData(UserDisplay);

      expect(Connected.displayName).toBe("withStore(UserDisplay)");
    });

    it("should use component name if displayName is not set", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { name: user.name };
      });

      function MyComponent({ name }: { name: string }) {
        return <div>{name}</div>;
      }

      const Connected = withUserData(MyComponent);

      expect(Connected.displayName).toBe("withStore(MyComponent)");
    });

    it("should preserve displayName for forwardRef components", () => {
      const withUserData = withStore((ctx) => {
        const [user] = ctx.get(userStore);
        return { value: user.name };
      });

      const RefComponent = forwardRef<HTMLInputElement, { value: string }>(
        ({ value }, ref) => <input ref={ref} value={value} readOnly />
      );
      RefComponent.displayName = "RefComponent";

      const Connected = withUserData(RefComponent);

      expect(Connected.displayName).toBe("withStore(RefComponent)");
    });
  });
});
