/**
 * Tests for tracking and hooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { store } from "./store";
import { container } from "./container";
import { withHooks, getHooks } from "./tracking";

describe("hooks", () => {
  describe("withHooks()", () => {
    it("should execute function with hooks and restore after", () => {
      const onRead = vi.fn();

      expect(getHooks().onRead).toBeUndefined();

      withHooks({ onRead }, () => {
        expect(getHooks().onRead).toBe(onRead);
      });

      // Restored after
      expect(getHooks().onRead).toBeUndefined();
    });

    it("should merge hooks with existing during execution", () => {
      const onRead = vi.fn();
      const onWrite = vi.fn();

      withHooks({ onRead }, () => {
        expect(getHooks().onRead).toBe(onRead);

        withHooks({ onWrite }, () => {
          // Both should be set (merged)
          expect(getHooks().onRead).toBe(onRead);
          expect(getHooks().onWrite).toBe(onWrite);
        });

        // onWrite restored, onRead still set
        expect(getHooks().onRead).toBe(onRead);
        expect(getHooks().onWrite).toBeUndefined();
      });
    });

    it("should work with setup function", () => {
      const onRead = vi.fn();

      withHooks(
        () => ({ onRead }),
        () => {
          expect(getHooks().onRead).toBe(onRead);
        }
      );

      expect(getHooks().onRead).toBeUndefined();
    });

    it("should receive current hooks in setup function", () => {
      const onRead = vi.fn();
      const onWrite = vi.fn();

      withHooks({ onRead }, () => {
        withHooks(
          (current) => {
            expect(current.onRead).toBe(onRead);
            return { ...current, onWrite };
          },
          () => {
            expect(getHooks().onRead).toBe(onRead);
            expect(getHooks().onWrite).toBe(onWrite);
          }
        );
      });
    });

    it("should restore hooks even if function throws", () => {
      const onRead = vi.fn();

      expect(() => {
        withHooks({ onRead }, () => {
          expect(getHooks().onRead).toBe(onRead);
          throw new Error("test");
        });
      }).toThrow("test");

      // Still restored after error
      expect(getHooks().onRead).toBeUndefined();
    });

    it("should return function result", () => {
      const result = withHooks({ onRead: vi.fn() }, () => {
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe("onRead hook", () => {
    it("should be called when reading store property", () => {
      const onRead = vi.fn();

      const counter = store({
        state: { count: 0 },
        setup: () => ({}),
      });

      const stores = container();
      const instance = stores.get(counter);

      withHooks({ onRead }, () => {
        // Read property
        const _value = instance.state.count;

        expect(onRead).toHaveBeenCalledWith(
          expect.objectContaining({
            storeId: expect.any(String),
            prop: "count",
            value: 0,
          })
        );
      });
    });

    it("should include storeId in event for container lookup", () => {
      const onRead = vi.fn();

      const counter = store({
        state: { count: 42, name: "test" },
        setup: () => ({}),
      });

      const stores = container();
      const instance = stores.get(counter);

      withHooks({ onRead }, () => {
        // Read property
        const _value = instance.state.count;

        expect(onRead).toHaveBeenCalledWith(
          expect.objectContaining({
            storeId: instance.id,
            prop: "count",
            value: 42,
          })
        );
      });

      // Can use storeId to get instance from container
      expect(stores.getById(instance.id)).toBe(instance);
    });
  });

  describe("onWrite hook", () => {
    it("should be called when writing store property", () => {
      const onWrite = vi.fn();

      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const stores = container();
      const instance = stores.get(counter);

      withHooks({ onWrite }, () => {
        instance.actions.setCount(5);

        expect(onWrite).toHaveBeenCalledWith(
          expect.objectContaining({
            storeId: expect.any(String),
            prop: "count",
            next: 5,
            prev: 0,
          })
        );
      });
    });

    it("should include storeId in event for container lookup", () => {
      const onWrite = vi.fn();

      const counter = store({
        state: { count: 0 },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const stores = container();
      const instance = stores.get(counter);

      withHooks({ onWrite }, () => {
        instance.actions.setCount(10);

        const call = onWrite.mock.calls[0][0];
        expect(call.storeId).toBe(instance.id);
        expect(call.prop).toBe("count");
        expect(call.next).toBe(10);
        expect(call.prev).toBe(0);
      });

      // Can use storeId to get instance from container
      expect(stores.getById(instance.id)).toBe(instance);
    });

    it("should be called even when value does not change", () => {
      const onWrite = vi.fn();

      const counter = store({
        state: { count: 5 },
        setup: ({ state }) => ({
          setCount: (n: number) => {
            state.count = n;
          },
        }),
      });

      const stores = container();
      const instance = stores.get(counter);

      withHooks({ onWrite }, () => {
        // Set same value
        instance.actions.setCount(5);

        // onWrite is still called (but equality check prevents actual update)
        expect(onWrite).toHaveBeenCalledWith(
          expect.objectContaining({
            prop: "count",
            next: 5,
            prev: 5,
          })
        );
      });
    });
  });

  describe("multiple hooks", () => {
    it("should track both reads and writes", () => {
      const onRead = vi.fn();
      const onWrite = vi.fn();

      const counter = store({
        state: { count: 0, doubled: 0 },
        setup: ({ state, effect }) => {
          effect(() => {
            state.doubled = state.count * 2;
          });
          return {
            increment: () => {
              state.count++;
            },
          };
        },
      });

      const stores = container();

      withHooks({ onRead, onWrite }, () => {
        const instance = stores.get(counter);

        // Clear initial calls from setup/get
        onRead.mockClear();
        onWrite.mockClear();

        // This should trigger writes
        instance.actions.increment();

        // onWrite should be called for count
        expect(onWrite).toHaveBeenCalledWith(
          expect.objectContaining({ prop: "count", next: 1, prev: 0 })
        );
      });
    });
  });
});
