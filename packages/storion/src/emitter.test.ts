import { describe, it, expect, vi } from "vitest";
import { emitter } from "./emitter";

describe("emitter", () => {
  describe("basic functionality", () => {
    it("should create an emitter", () => {
      const eventEmitter = emitter();
      expect(eventEmitter).toBeDefined();
      expect(typeof eventEmitter.on).toBe("function");
      expect(typeof eventEmitter.emit).toBe("function");
      expect(typeof eventEmitter.clear).toBe("function");
    });

    it("should add and call listeners", () => {
      const eventEmitter = emitter<string>();
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit("test");

      expect(listener).toHaveBeenCalledWith("test");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should support multiple listeners", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      eventEmitter.on(listener1);
      eventEmitter.on(listener2);
      eventEmitter.on(listener3);

      eventEmitter.emit("message");

      expect(listener1).toHaveBeenCalledWith("message");
      expect(listener2).toHaveBeenCalledWith("message");
      expect(listener3).toHaveBeenCalledWith("message");
    });

    it("should call listeners in order", () => {
      const eventEmitter = emitter<string>();
      const callOrder: string[] = [];

      eventEmitter.on(() => callOrder.push("first"));
      eventEmitter.on(() => callOrder.push("second"));
      eventEmitter.on(() => callOrder.push("third"));

      eventEmitter.emit("test");

      expect(callOrder).toEqual(["first", "second", "third"]);
    });

    it("should prevent duplicate listeners (same function added twice)", () => {
      const eventEmitter = emitter<string>();
      const listener = vi.fn();

      // Add the same listener twice
      eventEmitter.on(listener);
      eventEmitter.on(listener);

      eventEmitter.emit("test");

      // Should only be called once due to Set deduplication
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("test");
    });
  });

  describe("unsubscribe functionality", () => {
    it("should remove listener when unsubscribe is called", () => {
      const eventEmitter = emitter<string>();
      const listener = vi.fn();

      const unsubscribe = eventEmitter.on(listener);
      eventEmitter.emit("first");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      eventEmitter.emit("second");
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it("should allow multiple unsubscribe calls", () => {
      const eventEmitter = emitter<string>();
      const listener = vi.fn();

      const unsubscribe = eventEmitter.on(listener);
      unsubscribe();
      unsubscribe(); // Should be safe to call multiple times
      unsubscribe();

      eventEmitter.emit("test");
      expect(listener).not.toHaveBeenCalled();
    });

    it("should only remove the specific listener", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsubscribe1 = eventEmitter.on(listener1);
      eventEmitter.on(listener2);
      eventEmitter.on(listener3);

      unsubscribe1();
      eventEmitter.emit("test");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith("test");
      expect(listener3).toHaveBeenCalledWith("test");
    });
  });

  describe("clear functionality", () => {
    it("should remove all listeners when clear is called", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      eventEmitter.on(listener1);
      eventEmitter.on(listener2);
      eventEmitter.on(listener3);

      eventEmitter.clear();
      eventEmitter.emit("test");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).not.toHaveBeenCalled();
    });

    it("should allow adding listeners after clear", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventEmitter.on(listener1);
      eventEmitter.clear();
      eventEmitter.on(listener2);

      eventEmitter.emit("test");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith("test");
    });
  });

  describe("emit behavior", () => {
    it("should handle listeners that unsubscribe during emission", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      let unsubscribe2: VoidFunction | undefined;

      eventEmitter.on(listener1);
      unsubscribe2 = eventEmitter.on(() => {
        listener2();
        unsubscribe2?.(); // Unsubscribe during emission
      });
      eventEmitter.on(listener3);

      eventEmitter.emit("test");

      // All listeners should be called (emission uses slice() to avoid issues)
      expect(listener1).toHaveBeenCalledWith("test");
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalledWith("test");
    });

    it("should handle listeners that add new listeners during emission", () => {
      const eventEmitter = emitter<string>();
      const newListener = vi.fn();
      const listener = vi.fn(() => {
        eventEmitter.on(newListener);
      });

      eventEmitter.on(listener);
      eventEmitter.emit("test");

      expect(listener).toHaveBeenCalledWith("test");
      // New listener should not be called in the same emission cycle
      expect(newListener).not.toHaveBeenCalled();

      // But should be called in the next emission
      eventEmitter.emit("test2");
      expect(newListener).toHaveBeenCalledWith("test2");
    });

    it("should handle void payload type", () => {
      const eventEmitter = emitter<void>();
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit(undefined);

      expect(listener).toHaveBeenCalledWith(undefined);
    });

    it("should handle object payload type", () => {
      const eventEmitter = emitter<{ id: number; name: string }>();
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit({ id: 1, name: "test" });

      expect(listener).toHaveBeenCalledWith({ id: 1, name: "test" });
    });

    it("should handle number payload type", () => {
      const eventEmitter = emitter<number>();
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit(42);

      expect(listener).toHaveBeenCalledWith(42);
    });
  });

  describe("edge cases", () => {
    it("should handle empty emitter", () => {
      const eventEmitter = emitter<string>();
      // Should not throw when emitting with no listeners
      expect(() => eventEmitter.emit("test")).not.toThrow();
    });

    it("should handle clear on empty emitter", () => {
      const eventEmitter = emitter<string>();
      // Should not throw when clearing with no listeners
      expect(() => eventEmitter.clear()).not.toThrow();
    });

    it("should handle listener that throws an error", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn(() => {
        throw new Error("Listener error");
      });
      const listener3 = vi.fn();

      // Use console.error spy to catch the error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      eventEmitter.on(listener1);
      eventEmitter.on(listener2);
      eventEmitter.on(listener3);

      // Errors in listeners will propagate, but we can catch them
      // The implementation uses forEach which will stop on error
      // So we expect it to throw, but listener1 should have been called
      try {
        eventEmitter.emit("test");
      } catch (error) {
        // Error is expected
        expect(error).toBeInstanceOf(Error);
      }

      expect(listener1).toHaveBeenCalledWith("test");
      // listener2 threw, so listener3 may or may not be called depending on implementation
      // The current implementation stops on error, so listener3 won't be called

      consoleSpy.mockRestore();
    });
  });

  describe("array listeners", () => {
    it("should add multiple listeners at once using array", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      eventEmitter.on([listener1, listener2, listener3]);
      eventEmitter.emit("test");

      expect(listener1).toHaveBeenCalledWith("test");
      expect(listener2).toHaveBeenCalledWith("test");
      expect(listener3).toHaveBeenCalledWith("test");
    });

    it("should remove all array listeners when unsubscribe is called", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsubscribe = eventEmitter.on([listener1, listener2, listener3]);
      eventEmitter.emit("first");

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      unsubscribe();
      eventEmitter.emit("second");

      // Should not be called after unsubscribe
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it("should handle empty array", () => {
      const eventEmitter = emitter<string>();
      const unsubscribe = eventEmitter.on([]);
      
      expect(() => eventEmitter.emit("test")).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("initialListeners", () => {
    it("should create emitter with initial listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const eventEmitter = emitter<string>([listener1, listener2]);
      eventEmitter.emit("test");

      expect(listener1).toHaveBeenCalledWith("test");
      expect(listener2).toHaveBeenCalledWith("test");
    });

    it("should allow adding more listeners after creation with initial listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const eventEmitter = emitter<string>([listener1]);
      eventEmitter.on(listener2);
      eventEmitter.on(listener3);
      eventEmitter.emit("test");

      expect(listener1).toHaveBeenCalledWith("test");
      expect(listener2).toHaveBeenCalledWith("test");
      expect(listener3).toHaveBeenCalledWith("test");
    });

    it("should handle empty initial listeners array", () => {
      const eventEmitter = emitter<string>([]);
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit("test");

      expect(listener).toHaveBeenCalledWith("test");
    });

    it("should handle undefined initial listeners", () => {
      const eventEmitter = emitter<string>(undefined);
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.emit("test");

      expect(listener).toHaveBeenCalledWith("test");
    });

    it("should deduplicate initial listeners", () => {
      const listener = vi.fn();

      // Pass the same listener twice
      const eventEmitter = emitter<string>([listener, listener]);
      eventEmitter.emit("test");

      // Should only be called once due to Set deduplication
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should allow clearing initial listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const eventEmitter = emitter<string>([listener1, listener2]);
      eventEmitter.clear();
      eventEmitter.emit("test");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it("should work with void payload and initial listeners", () => {
      const listener = vi.fn();

      const eventEmitter = emitter<void>([listener]);
      eventEmitter.emit(undefined);

      expect(listener).toHaveBeenCalledWith(undefined);
    });
  });

  describe("settle functionality", () => {
    it("should emit to all listeners and clear when settled", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventEmitter.on(listener1);
      eventEmitter.on(listener2);
      eventEmitter.settle("final");

      expect(listener1).toHaveBeenCalledWith("final");
      expect(listener2).toHaveBeenCalledWith("final");
      expect(eventEmitter.size).toBe(0);
    });

    it("should set settled to true after settle", () => {
      const eventEmitter = emitter<string>();

      expect(eventEmitter.settled).toBe(false);
      eventEmitter.settle("done");
      expect(eventEmitter.settled).toBe(true);
    });

    it("should call late subscribers immediately with settled payload", () => {
      const eventEmitter = emitter<string>();
      eventEmitter.settle("settled-value");

      const lateListener = vi.fn();
      eventEmitter.on(lateListener);

      expect(lateListener).toHaveBeenCalledWith("settled-value");
      expect(lateListener).toHaveBeenCalledTimes(1);
    });

    it("should return no-op unsubscribe for late subscribers", () => {
      const eventEmitter = emitter<string>();
      eventEmitter.settle("done");

      const lateListener = vi.fn();
      const unsub = eventEmitter.on(lateListener);

      // Calling unsub should be safe (no-op)
      unsub();
      unsub(); // Multiple calls should be safe
    });

    it("should not add late subscribers to listeners set", () => {
      const eventEmitter = emitter<string>();
      eventEmitter.settle("done");

      const lateListener = vi.fn();
      eventEmitter.on(lateListener);

      // Size should still be 0 (late subscribers are not added)
      expect(eventEmitter.size).toBe(0);
    });

    it("should make emit a no-op after settle", () => {
      const eventEmitter = emitter<string>();
      const listener = vi.fn();

      eventEmitter.settle("final");
      eventEmitter.on(listener);

      // Reset the mock after the immediate call
      listener.mockReset();

      // emit should be a no-op
      eventEmitter.emit("ignored");
      expect(listener).not.toHaveBeenCalled();
    });

    it("should make emitAndClear a no-op after settle", () => {
      const eventEmitter = emitter<string>();
      eventEmitter.settle("final");

      const listener = vi.fn();
      eventEmitter.on(listener);
      listener.mockReset();

      // emitAndClear should be a no-op
      eventEmitter.emitAndClear("ignored");
      expect(listener).not.toHaveBeenCalled();
    });

    it("should only settle once (subsequent settle calls are no-ops)", () => {
      const eventEmitter = emitter<string>();
      eventEmitter.settle("first");

      const listener = vi.fn();
      eventEmitter.on(listener);
      expect(listener).toHaveBeenCalledWith("first");

      listener.mockReset();

      // Second settle should be ignored
      eventEmitter.settle("second");
      eventEmitter.on(listener);

      // Should still receive "first", not "second"
      expect(listener).toHaveBeenCalledWith("first");
    });

    it("should work with void payload", () => {
      const eventEmitter = emitter<void>();
      const listener = vi.fn();

      eventEmitter.on(listener);
      eventEmitter.settle(undefined);

      expect(listener).toHaveBeenCalledWith(undefined);
      expect(eventEmitter.settled).toBe(true);

      // Late subscriber should receive undefined
      const lateListener = vi.fn();
      eventEmitter.on(lateListener);
      expect(lateListener).toHaveBeenCalledWith(undefined);
    });

    it("should work with object payload", () => {
      const eventEmitter = emitter<{ status: string }>();
      const payload = { status: "complete" };

      eventEmitter.settle(payload);

      const listener = vi.fn();
      eventEmitter.on(listener);

      expect(listener).toHaveBeenCalledWith(payload);
    });

    it("should handle settle with map function for late subscribers", () => {
      const eventEmitter = emitter<{ type: string; data: number }>();
      eventEmitter.settle({ type: "success", data: 42 });

      const listener = vi.fn();
      eventEmitter.on(
        (e) => (e.type === "success" ? { value: e.data } : undefined),
        listener
      );

      expect(listener).toHaveBeenCalledWith(42);
    });

    it("should not call late subscriber if map returns undefined", () => {
      const eventEmitter = emitter<{ type: string; data: number }>();
      eventEmitter.settle({ type: "error", data: 0 });

      const listener = vi.fn();
      eventEmitter.on(
        (e) => (e.type === "success" ? { value: e.data } : undefined),
        listener
      );

      // Listener should not be called because map returned undefined
      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener adding new listener during settle emission", () => {
      const eventEmitter = emitter<string>();
      const callOrder: string[] = [];

      // First listener adds a new listener during emission
      eventEmitter.on((payload) => {
        callOrder.push(`first: ${payload}`);

        // Add a new listener during settle emission
        // Since settle sets isSettled=true BEFORE emit, this new listener
        // should be called immediately with the settled payload
        eventEmitter.on((p) => {
          callOrder.push(`added-during-settle: ${p}`);
        });
      });

      eventEmitter.settle("done");

      // First listener called with "done"
      // New listener added during emission gets called immediately (settled behavior)
      expect(callOrder).toEqual(["first: done", "added-during-settle: done"]);
    });

    it("should immediately call nested listeners added during settle", () => {
      const eventEmitter = emitter<number>();
      const nestedListener = vi.fn();

      eventEmitter.on(() => {
        // Add listener during settle - should be called immediately
        eventEmitter.on(nestedListener);
      });

      eventEmitter.settle(42);

      // Nested listener should have been called immediately with settled value
      expect(nestedListener).toHaveBeenCalledWith(42);
      expect(nestedListener).toHaveBeenCalledTimes(1);
    });

    it("should handle array of listeners added during settle", () => {
      const eventEmitter = emitter<string>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventEmitter.on(() => {
        // Add array of listeners during settle
        eventEmitter.on([listener1, listener2]);
      });

      eventEmitter.settle("value");

      // Both listeners should be called immediately
      expect(listener1).toHaveBeenCalledWith("value");
      expect(listener2).toHaveBeenCalledWith("value");
    });

    it("should handle deeply nested listener additions during settle", () => {
      const eventEmitter = emitter<number>();
      const callOrder: string[] = [];

      eventEmitter.on((v) => {
        callOrder.push(`L1: ${v}`);
        eventEmitter.on((v) => {
          callOrder.push(`L2: ${v}`);
          eventEmitter.on((v) => {
            callOrder.push(`L3: ${v}`);
          });
        });
      });

      eventEmitter.settle(1);

      // All nested listeners should be called immediately with settled value
      expect(callOrder).toEqual(["L1: 1", "L2: 1", "L3: 1"]);
    });

    it("should preserve settled payload for listeners added at any depth", () => {
      const eventEmitter = emitter<{ id: number }>();
      const payload = { id: 123 };
      const collectedPayloads: { id: number }[] = [];

      eventEmitter.on((p) => {
        collectedPayloads.push(p);
        eventEmitter.on((p) => {
          collectedPayloads.push(p);
        });
      });

      eventEmitter.settle(payload);

      // All payloads should be the same reference
      expect(collectedPayloads).toHaveLength(2);
      expect(collectedPayloads[0]).toBe(payload);
      expect(collectedPayloads[1]).toBe(payload);
    });
  });
});
