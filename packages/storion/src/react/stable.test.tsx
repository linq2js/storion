/**
 * @jest-environment jsdom
 */

import React, { forwardRef, memo, useRef, createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { stable } from "./stable";

describe("stable()", () => {
  // =============================================================================
  // Basic functionality
  // =============================================================================

  describe("basic wrapping", () => {
    it("should wrap a simple function component", () => {
      const Inner = ({ name }: { name: string }) => <div>{name}</div>;
      const Stable = stable(Inner);

      render(<Stable name="test" />);
      expect(screen.getByText("test")).toBeInTheDocument();
    });

    it("should wrap a forwardRef component and pass ref", () => {
      const Inner = forwardRef<HTMLInputElement, { value: string }>(
        ({ value }, ref) => <input ref={ref} value={value} readOnly />
      );
      const Stable = stable(Inner);

      const ref = createRef<HTMLInputElement>();
      render(<Stable ref={ref} value="test" />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.value).toBe("test");
    });

    it("should wrap a render function with ref (arity detection)", () => {
      const render_ = (
        { value }: { value: string },
        ref: React.Ref<HTMLInputElement>
      ) => <input ref={ref} value={value} readOnly />;

      const Stable = stable(render_);

      const ref = createRef<HTMLInputElement>();
      render(<Stable ref={ref} value="test" />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.value).toBe("test");
    });

    it("should set displayName correctly", () => {
      const MyComponent = ({ name }: { name: string }) => <div>{name}</div>;
      MyComponent.displayName = "MyComponent";

      const Stable = stable(MyComponent);
      expect(Stable.displayName).toBe("Stable(MyComponent)");
    });

    it("should use function name if displayName not set", () => {
      function NamedComponent({ name }: { name: string }) {
        return <div>{name}</div>;
      }

      const Stable = stable(NamedComponent);
      expect(Stable.displayName).toBe("Stable(NamedComponent)");
    });
  });

  // =============================================================================
  // Auto-stabilization of functions (wrapper pattern)
  // =============================================================================

  describe("auto function stabilization", () => {
    it("should provide stable function reference across renders", () => {
      const receivedFns: Array<() => void> = [];

      const Inner = ({ onClick }: { onClick: () => void }) => {
        receivedFns.push(onClick);
        return <button onClick={onClick}>Click</button>;
      };
      const Stable = stable(Inner);

      const { rerender } = render(<Stable onClick={() => console.log("a")} />);
      rerender(<Stable onClick={() => console.log("b")} />);

      expect(receivedFns).toHaveLength(2);
      // Reference stays stable even when function source changes
      expect(receivedFns[0]).toBe(receivedFns[1]);
    });

    it("should always call the latest function", () => {
      const calls: string[] = [];

      const Inner = ({ onClick }: { onClick: () => void }) => (
        <button data-testid="btn" onClick={onClick}>
          Click
        </button>
      );
      const Stable = stable(Inner);

      const { rerender } = render(
        <Stable onClick={() => calls.push("first")} />
      );

      // Click with first function
      fireEvent.click(screen.getByTestId("btn"));
      expect(calls).toEqual(["first"]);

      // Update to second function
      rerender(<Stable onClick={() => calls.push("second")} />);

      // Click should call the NEW function
      fireEvent.click(screen.getByTestId("btn"));
      expect(calls).toEqual(["first", "second"]);
    });

    it("should stabilize multiple function props independently", () => {
      const receivedFns: Array<{
        onA: () => void;
        onB: () => void;
      }> = [];

      const Inner = ({
        onA,
        onB,
      }: {
        onA: () => void;
        onB: () => void;
      }) => {
        receivedFns.push({ onA, onB });
        return (
          <div>
            <button onClick={onA}>A</button>
            <button onClick={onB}>B</button>
          </div>
        );
      };
      const Stable = stable(Inner);

      const { rerender } = render(
        <Stable onA={() => {}} onB={() => {}} />
      );
      rerender(<Stable onA={() => {}} onB={() => {}} />);

      expect(receivedFns).toHaveLength(2);
      expect(receivedFns[0].onA).toBe(receivedFns[1].onA);
      expect(receivedFns[0].onB).toBe(receivedFns[1].onB);
    });

    it("should handle function with arguments", () => {
      const results: number[] = [];

      const Inner = ({
        compute,
      }: {
        compute: (x: number, y: number) => number;
      }) => (
        <button
          data-testid="btn"
          onClick={() => results.push(compute(2, 3))}
        >
          Compute
        </button>
      );
      const Stable = stable(Inner);

      const { rerender } = render(
        <Stable compute={(x, y) => x + y} />
      );

      fireEvent.click(screen.getByTestId("btn"));
      expect(results).toEqual([5]); // 2 + 3

      // Change to multiplication
      rerender(<Stable compute={(x, y) => x * y} />);

      fireEvent.click(screen.getByTestId("btn"));
      expect(results).toEqual([5, 6]); // 2 * 3
    });
  });

  // =============================================================================
  // Auto-stabilization of dates
  // =============================================================================

  describe("auto date stabilization", () => {
    it("should stabilize Date props with same timestamp", () => {
      const receivedDates: Date[] = [];

      const Inner = ({ date }: { date: Date }) => {
        receivedDates.push(date);
        return <div>{date.toISOString()}</div>;
      };
      const Stable = stable(Inner);

      const timestamp = 1703500800000; // Fixed timestamp
      const { rerender } = render(<Stable date={new Date(timestamp)} />);
      rerender(<Stable date={new Date(timestamp)} />);

      expect(receivedDates).toHaveLength(2);
      expect(receivedDates[0]).toBe(receivedDates[1]); // Same reference
    });

    it("should NOT stabilize Date props with different timestamp", () => {
      const receivedDates: Date[] = [];

      const Inner = ({ date }: { date: Date }) => {
        receivedDates.push(date);
        return <div>{date.toISOString()}</div>;
      };
      const Stable = stable(Inner);

      const { rerender } = render(<Stable date={new Date(1703500800000)} />);
      rerender(<Stable date={new Date(1703500900000)} />);

      expect(receivedDates).toHaveLength(2);
      expect(receivedDates[0]).not.toBe(receivedDates[1]); // Different reference
    });
  });

  // =============================================================================
  // Custom equality
  // =============================================================================

  describe("custom prop equality", () => {
    it("should use shallow equality for specified prop", () => {
      const receivedData: Array<{ id: number }> = [];

      const Inner = ({ data }: { data: { id: number } }) => {
        receivedData.push(data);
        return <div>{data.id}</div>;
      };
      const Stable = stable(Inner, { data: "shallow" });

      const { rerender } = render(<Stable data={{ id: 1 }} />);
      rerender(<Stable data={{ id: 1 }} />);

      expect(receivedData).toHaveLength(2);
      expect(receivedData[0]).toBe(receivedData[1]); // Same reference due to shallow equality
    });

    it("should NOT stabilize with shallow equality when values differ", () => {
      const receivedData: Array<{ id: number }> = [];

      const Inner = ({ data }: { data: { id: number } }) => {
        receivedData.push(data);
        return <div>{data.id}</div>;
      };
      const Stable = stable(Inner, { data: "shallow" });

      const { rerender } = render(<Stable data={{ id: 1 }} />);
      rerender(<Stable data={{ id: 2 }} />);

      expect(receivedData).toHaveLength(2);
      expect(receivedData[0]).not.toBe(receivedData[1]); // Different values
    });

    it("should use deep equality for specified prop", () => {
      const receivedData: Array<{ nested: { id: number } }> = [];

      const Inner = ({ data }: { data: { nested: { id: number } } }) => {
        receivedData.push(data);
        return <div>{data.nested.id}</div>;
      };
      const Stable = stable(Inner, { data: "deep" });

      const { rerender } = render(<Stable data={{ nested: { id: 1 } }} />);
      rerender(<Stable data={{ nested: { id: 1 } }} />);

      expect(receivedData).toHaveLength(2);
      expect(receivedData[0]).toBe(receivedData[1]); // Same reference due to deep equality
    });

    it("should use custom equality function", () => {
      const receivedItems: Array<{ id: number; timestamp: number }> = [];

      const Inner = ({ item }: { item: { id: number; timestamp: number } }) => {
        receivedItems.push(item);
        return <div>{item.id}</div>;
      };

      // Custom equality: compare only by id, ignore timestamp
      const Stable = stable(Inner, {
        item: (a, b) => a.id === b.id,
      });

      const { rerender } = render(
        <Stable item={{ id: 1, timestamp: 1000 }} />
      );
      rerender(<Stable item={{ id: 1, timestamp: 2000 }} />);

      expect(receivedItems).toHaveLength(2);
      expect(receivedItems[0]).toBe(receivedItems[1]); // Same reference (id matches)
    });

    it("should mix custom and auto equality for different props", () => {
      const receivedProps: Array<{
        data: { id: number };
        onClick: () => void;
      }> = [];

      const Inner = ({
        data,
        onClick,
      }: {
        data: { id: number };
        onClick: () => void;
      }) => {
        receivedProps.push({ data, onClick });
        return <button onClick={onClick}>{data.id}</button>;
      };

      const Stable = stable(Inner, { data: "shallow" });

      const { rerender } = render(
        <Stable data={{ id: 1 }} onClick={() => console.log("click")} />
      );
      rerender(
        <Stable data={{ id: 1 }} onClick={() => console.log("click2")} />
      );

      expect(receivedProps).toHaveLength(2);
      // data should be stabilized with shallow equality
      expect(receivedProps[0].data).toBe(receivedProps[1].data);
      // onClick should be auto-stabilized (wrapper pattern)
      expect(receivedProps[0].onClick).toBe(receivedProps[1].onClick);
    });
  });

  // =============================================================================
  // Edge cases
  // =============================================================================

  describe("edge cases", () => {
    it("should handle props added/removed between renders", () => {
      const receivedProps: Array<Record<string, unknown>> = [];

      const Inner = (props: { a?: number; b?: number }) => {
        receivedProps.push({ ...props });
        return <div>{props.a ?? props.b}</div>;
      };
      const Stable = stable(Inner);

      const { rerender } = render(<Stable a={1} />);
      rerender(<Stable b={2} />);

      expect(receivedProps).toHaveLength(2);
      expect(receivedProps[0]).toEqual({ a: 1 });
      expect(receivedProps[1]).toEqual({ b: 2 });
    });

    it("should handle null and undefined props", () => {
      const receivedProps: Array<{
        value: string | null | undefined;
      }> = [];

      const Inner = ({
        value,
      }: {
        value: string | null | undefined;
      }) => {
        receivedProps.push({ value });
        return <div>{value ?? "none"}</div>;
      };
      const Stable = stable(Inner);

      const { rerender } = render(<Stable value={null} />);
      rerender(<Stable value={null} />);
      rerender(<Stable value={undefined} />);

      expect(receivedProps).toHaveLength(3);
      expect(receivedProps[0].value).toBe(receivedProps[1].value); // null === null
      expect(receivedProps[2].value).toBe(undefined);
    });

    it("should work with memo wrapped inside stable", () => {
      const renderCount = { value: 0 };

      const Inner = memo(({ name }: { name: string }) => {
        renderCount.value++;
        return <div>{name}</div>;
      });
      const Stable = stable(Inner);

      const { rerender } = render(<Stable name="test" />);
      rerender(<Stable name="test" />);

      // memo should still work - same props means no re-render
      expect(renderCount.value).toBe(1);
    });

    it("should preserve children prop", () => {
      const Inner = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="container">{children}</div>
      );
      const Stable = stable(Inner);

      render(
        <Stable>
          <span>Child content</span>
        </Stable>
      );

      expect(screen.getByTestId("container")).toContainHTML(
        "<span>Child content</span>"
      );
    });

    it("should handle primitives without modification", () => {
      const receivedProps: Array<{
        str: string;
        num: number;
        bool: boolean;
      }> = [];

      const Inner = ({
        str,
        num,
        bool,
      }: {
        str: string;
        num: number;
        bool: boolean;
      }) => {
        receivedProps.push({ str, num, bool });
        return (
          <div>
            {str}-{num}-{String(bool)}
          </div>
        );
      };
      const Stable = stable(Inner);

      const { rerender } = render(<Stable str="a" num={1} bool={true} />);
      rerender(<Stable str="a" num={1} bool={true} />);

      expect(receivedProps).toHaveLength(2);
      // Primitives compared with strict equality
      expect(receivedProps[0].str).toBe(receivedProps[1].str);
      expect(receivedProps[0].num).toBe(receivedProps[1].num);
      expect(receivedProps[0].bool).toBe(receivedProps[1].bool);
    });
  });

  // =============================================================================
  // Integration with memoized children
  // =============================================================================

  describe("integration with memoized children", () => {
    it("should prevent memoized children from re-rendering with stabilized callbacks", () => {
      const childRenderCount = { value: 0 };

      const ChildButton = memo(({ onClick }: { onClick: () => void }) => {
        childRenderCount.value++;
        return <button onClick={onClick}>Click me</button>;
      });

      const Parent = stable(({ onClick }: { onClick: () => void }) => (
        <ChildButton onClick={onClick} />
      ));

      const { rerender } = render(
        <Parent onClick={() => console.log("click")} />
      );

      // Re-render with different callback
      rerender(<Parent onClick={() => console.log("different")} />);

      // Child should NOT re-render because callback reference is stable
      expect(childRenderCount.value).toBe(1);
    });

    it("should work correctly when callback behavior changes", () => {
      const childRenderCount = { value: 0 };
      const calls: string[] = [];

      const ChildButton = memo(({ onClick }: { onClick: () => void }) => {
        childRenderCount.value++;
        return (
          <button data-testid="child-btn" onClick={onClick}>
            Click me
          </button>
        );
      });

      const Parent = stable(({ onClick }: { onClick: () => void }) => (
        <ChildButton onClick={onClick} />
      ));

      const { rerender } = render(
        <Parent onClick={() => calls.push("first")} />
      );

      // Click calls first callback
      fireEvent.click(screen.getByTestId("child-btn"));
      expect(calls).toEqual(["first"]);

      // Re-render with different callback
      rerender(<Parent onClick={() => calls.push("second")} />);

      // Child still hasn't re-rendered
      expect(childRenderCount.value).toBe(1);

      // But clicking now calls the NEW callback
      fireEvent.click(screen.getByTestId("child-btn"));
      expect(calls).toEqual(["first", "second"]);
    });
  });
});
