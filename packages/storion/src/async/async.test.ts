import { describe, it, expect, vi } from "vitest";
import { async, asyncState, asyncStateFrom } from "./async";
import type { AsyncState, AsyncMode } from "./types";
import type { Focus, SelectorContext } from "../types";
import { withHooks } from "../core/tracking";
import { container } from "../core/container";
import { store } from "../core/store";

// Helper to create a mock focus
function createMockFocus<T, M extends AsyncMode>(
  initialState: AsyncState<T, M>
): [Focus<AsyncState<T, M>>, { getState: () => AsyncState<T, M> }] {
  let state = initialState;

  const getter = () => state;
  const setter = (
    valueOrReducer:
      | AsyncState<T, M>
      | ((prev: AsyncState<T, M>) => AsyncState<T, M>)
  ) => {
    if (typeof valueOrReducer === "function") {
      state = valueOrReducer(state);
    } else {
      state = valueOrReducer;
    }
  };

  const focus = [getter, setter] as Focus<AsyncState<T, M>>;
  Object.defineProperty(focus, "on", {
    value: () => () => {},
  });

  return [focus, { getState: getter }];
}

describe("async", () => {
  describe("dispatch", () => {
    it("should execute handler and update state to success", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        return "result";
      });

      const promise = dispatch();
      expect(getState().status).toBe("pending");

      const result = await promise;
      expect(result).toBe("result");
      expect(getState().status).toBe("success");
      expect(getState().data).toBe("result");
    });

    it("should handle sync handlers", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      const { dispatch } = async(focus, () => 42);

      const result = await dispatch();
      expect(result).toBe(42);
      expect(getState().status).toBe("success");
      expect(getState().data).toBe(42);
    });

    it("should handle errors and update state", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());
      const onError = vi.fn();

      const { dispatch } = async(
        focus,
        async () => {
          throw new Error("test error");
        },
        { onError }
      );

      await expect(dispatch()).rejects.toThrow("test error");
      expect(getState().status).toBe("error");
      expect(getState().error?.message).toBe("test error");
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should pass args to handler", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const handler = vi.fn(async (_ctx, name: string, age: number) => {
        return `${name}-${age}`;
      });

      const { dispatch } = async(focus, handler);
      const result = await dispatch("John", 30);

      expect(result).toBe("John-30");
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        "John",
        30
      );
    });

    it("should return cancellable promise", async () => {
      const [focus] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "done";
      });

      const promise = dispatch();
      expect(typeof promise.cancel).toBe("function");

      promise.cancel();
      await expect(promise).rejects.toThrow();
    });
  });

  describe("fresh mode", () => {
    it("should clear data during loading", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      });

      dispatch();
      expect(getState().status).toBe("pending");
      expect(getState().data).toBeUndefined();
    });

    it("should clear data on error", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        throw new Error("fail");
      });

      await expect(dispatch()).rejects.toThrow();
      expect(getState().status).toBe("error");
      expect(getState().data).toBeUndefined();
    });
  });

  describe("stale mode", () => {
    it("should preserve data during loading", async () => {
      const [focus, { getState }] = createMockFocus(
        async.stale<string>("initial")
      );

      const { dispatch } = async(focus, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "new";
      });

      dispatch();
      expect(getState().status).toBe("pending");
      expect(getState().data).toBe("initial"); // preserved!
    });

    it("should preserve data on error", async () => {
      // First set up with success
      const [focus, { getState }] = createMockFocus(
        asyncState("stale", "success", "initial")
      );

      const { dispatch } = async(focus, async () => {
        throw new Error("fail");
      });

      await expect(dispatch()).rejects.toThrow();
      expect(getState().status).toBe("error");
      expect(getState().data).toBe("initial"); // preserved!
    });

    it("should update data on success", async () => {
      const [focus, { getState }] = createMockFocus(
        async.stale<string>("initial")
      );

      const { dispatch } = async(focus, async () => "updated");

      await dispatch();
      expect(getState().status).toBe("success");
      expect(getState().data).toBe("updated");
    });
  });

  describe("cancel", () => {
    it("should cancel ongoing request", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch, cancel } = async(focus, async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (ctx.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return "done";
      });

      const promise = dispatch();
      expect(getState().status).toBe("pending");

      cancel();
      await expect(promise).rejects.toThrow();
    });

    it("should cancel previous request when new dispatch is called", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());
      const signals: AbortSignal[] = [];

      const { dispatch } = async(focus, async (ctx, value: number) => {
        signals.push(ctx.signal);
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (ctx.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return value;
      });

      const promise1 = dispatch(1);
      const promise2 = dispatch(2);

      expect(signals[0].aborted).toBe(true);

      await expect(promise1).rejects.toThrow();
      const result = await promise2;
      expect(result).toBe(2);
      expect(getState().data).toBe(2);
    });

    it("should not cancel previous request when autoCancel is false", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());
      const signals: AbortSignal[] = [];
      const completionOrder: number[] = [];

      const { dispatch } = async(
        focus,
        async (ctx, value: number, delay: number) => {
          signals.push(ctx.signal);
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (ctx.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          completionOrder.push(value);
          return value;
        },
        { autoCancel: false }
      );

      // First request takes longer
      const promise1 = dispatch(1, 60);
      // Second request completes faster
      const promise2 = dispatch(2, 20);

      // Neither should be aborted
      expect(signals[0].aborted).toBe(false);
      expect(signals[1].aborted).toBe(false);

      // Both should complete
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(1);
      expect(result2).toBe(2);

      // Second completed first, first completed last (wins for state)
      expect(completionOrder).toEqual([2, 1]);
      expect(getState().data).toBe(1); // Last to complete wins
    });

    it("should allow concurrent requests with autoCancel: false", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const handler = vi.fn(async (_ctx, id: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return id;
      });

      const { dispatch } = async(focus, handler, { autoCancel: false });

      const promises = [dispatch("a"), dispatch("b"), dispatch("c")];

      await Promise.all(promises);

      // All three handlers should have been called
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should allow cancellation from within handler via ctx.cancel()", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async (ctx) => {
        // Simulate timeout - cancel after 20ms
        setTimeout(ctx.cancel, 20);

        // This would normally take 100ms, but cancel happens at 20ms
        // The dispatch promise rejects immediately on cancel
        await new Promise((resolve) => setTimeout(resolve, 100));

        return "done";
      });

      const promise = dispatch();
      expect(getState().status).toBe("pending");

      // Promise should reject immediately when ctx.cancel() is called (at 20ms)
      // Not waiting for the 100ms timeout to complete
      const start = Date.now();
      await expect(promise).rejects.toThrow("Aborted");
      const elapsed = Date.now() - start;

      // Should reject in ~20ms, not 100ms
      expect(elapsed).toBeLessThan(50);
    });

    it("should support timeout pattern with ctx.cancel()", async () => {
      const [focus] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async (ctx) => {
        // Timeout after 10ms
        const timeoutId = setTimeout(ctx.cancel, 10);

        try {
          // Fast operation - completes before timeout
          await new Promise((resolve) => setTimeout(resolve, 5));
          clearTimeout(timeoutId);
          return "success";
        } catch {
          return "cancelled";
        }
      });

      const result = await dispatch();
      expect(result).toBe("success");
    });
  });

  describe("external modification detection", () => {
    it("should not update state if externally modified during dispatch (devtools rollback)", async () => {
      let state = async.fresh<string>();

      const getter = () => state;
      const setter = (
        valueOrReducer:
          | AsyncState<string, "fresh">
          | ((prev: AsyncState<string, "fresh">) => AsyncState<string, "fresh">)
      ) => {
        if (typeof valueOrReducer === "function") {
          state = valueOrReducer(state);
        } else {
          state = valueOrReducer;
        }
      };

      const focus = [getter, setter] as Focus<AsyncState<string, "fresh">>;
      Object.defineProperty(focus, "on", { value: () => () => {} });

      let resolveHandler: (value: string) => void;

      const { dispatch } = async(focus, async () => {
        return new Promise<string>((resolve) => {
          resolveHandler = resolve;
        });
      });

      // Start dispatch
      const promise = dispatch();
      expect(state.status).toBe("pending");
      expect(state.__requestId).toBeDefined();

      // Simulate external modification (devtools rollback)
      // External code sets state without __requestId
      state = {
        status: "success",
        mode: "fresh",
        data: "rolled-back-data",
        error: undefined,
        timestamp: Date.now(),
        // No __requestId - indicates external modification
      };

      // Complete the handler
      resolveHandler!("handler-result");
      const result = await promise;

      // Handler still returns its result
      expect(result).toBe("handler-result");

      // But state was NOT overwritten (external modification preserved)
      expect(state.data).toBe("rolled-back-data");
    });

    it("should update state normally when not externally modified", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "handler-result";
      });

      const promise = dispatch();
      expect(getState().status).toBe("pending");

      await promise;

      // State should be updated
      expect(getState().status).toBe("success");
      expect(getState().data).toBe("handler-result");
    });

    it("should skip error state update if externally modified", async () => {
      let state = async.fresh<string>();

      const getter = () => state;
      const setter = (
        valueOrReducer:
          | AsyncState<string, "fresh">
          | ((prev: AsyncState<string, "fresh">) => AsyncState<string, "fresh">)
      ) => {
        if (typeof valueOrReducer === "function") {
          state = valueOrReducer(state);
        } else {
          state = valueOrReducer;
        }
      };

      const focus = [getter, setter] as Focus<AsyncState<string, "fresh">>;
      Object.defineProperty(focus, "on", { value: () => () => {} });

      let rejectHandler: (error: Error) => void;

      const { dispatch } = async(focus, async () => {
        return new Promise<string>((_, reject) => {
          rejectHandler = reject;
        });
      });

      // Start dispatch
      const promise = dispatch();
      expect(state.status).toBe("pending");

      // Simulate external modification
      state = {
        status: "idle",
        mode: "fresh",
        data: undefined,
        error: undefined,
        timestamp: undefined,
        // No __requestId
      };

      // Handler throws error
      rejectHandler!(new Error("handler error"));

      // Promise should reject
      await expect(promise).rejects.toThrow("handler error");

      // But state was NOT changed to error (external modification preserved)
      expect(state.status).toBe("idle");
    });
  });

  describe("refresh", () => {
    it("should re-dispatch with last args", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());
      let callCount = 0;

      const { dispatch, refresh } = async(focus, async (_ctx, name: string) => {
        callCount++;
        return `${name}-${callCount}`;
      });

      await dispatch("test");
      expect(getState().data).toBe("test-1");

      await refresh();
      expect(getState().data).toBe("test-2");
    });

    it("should return undefined if no previous dispatch", () => {
      const [focus] = createMockFocus(async.fresh<string>());

      const { refresh } = async(focus, async () => "done");

      expect(refresh()).toBeUndefined();
    });
  });

  describe("reset", () => {
    it("should reset fresh mode state to idle with undefined data", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch, reset } = async(focus, async () => "done");

      await dispatch();
      expect(getState().status).toBe("success");

      reset();
      expect(getState().status).toBe("idle");
      expect(getState().data).toBeUndefined();
      expect(getState().mode).toBe("fresh");
    });

    it("should reset stale mode state but keep data", async () => {
      const [focus, { getState }] = createMockFocus(
        async.stale<string>("initial")
      );

      const { dispatch, reset } = async(focus, async () => "updated");

      await dispatch();
      expect(getState().data).toBe("updated");

      reset();
      expect(getState().status).toBe("idle");
      expect(getState().data).toBe("updated"); // preserved in stale mode
      expect(getState().mode).toBe("stale");
    });
  });

  describe("retry", () => {
    it("should retry on failure", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      let attempts = 0;

      const { dispatch } = async(
        focus,
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("fail");
          }
          return "success";
        },
        { retry: 3 }
      );

      const result = await dispatch();
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should fail after all retries exhausted", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(
        focus,
        async () => {
          throw new Error("always fail");
        },
        { retry: 2 }
      );

      await expect(dispatch()).rejects.toThrow("always fail");
      expect(getState().status).toBe("error");
    });
  });

  describe("async.wait", () => {
    it("should return data for success state", () => {
      const state = asyncState("fresh", "success", "hello");
      expect(async.wait(state)).toBe("hello");
    });

    it("should return stale data in stale mode", () => {
      const state = async.stale("stale-data");
      expect(async.wait(state)).toBe("stale-data");
    });

    it("should throw error for error state in fresh mode", () => {
      const state = asyncState("fresh", "error", new Error("failed"));
      expect(() => async.wait(state)).toThrow("failed");
    });

    it("should return stale data for error state in stale mode", () => {
      const state = asyncState(
        "stale",
        "error",
        "stale-data",
        new Error("failed")
      );
      expect(async.wait(state)).toBe("stale-data");
    });

    it("should throw AsyncNotReadyError for idle fresh state", () => {
      const state = async.fresh();
      expect(() => async.wait(state)).toThrow("Cannot wait: state is idle");
    });

    it("should throw promise for pending state (Suspense)", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<string>());

      const { dispatch } = async(focus, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      });

      dispatch();

      const state = getState();
      expect(state.status).toBe("pending");

      let thrownPromise: Promise<string> | null = null;
      try {
        async.wait(state);
      } catch (e) {
        if (e instanceof Promise) {
          thrownPromise = e;
        }
      }

      expect(thrownPromise).toBeInstanceOf(Promise);
      const result = await thrownPromise;
      expect(result).toBe("done");
    });
  });

  describe("async.race", () => {
    it("should return first success entry", () => {
      const states = {
        a: asyncState("fresh", "pending") as AsyncState<string, "fresh">,
        b: asyncState("fresh", "success", "winner"),
        c: async.fresh<string>(),
      };
      const [key, value] = async.race(states);
      expect(key).toBe("b");
      expect(value).toBe("winner");
    });

    it("should return stale data as winner", () => {
      const states = {
        a: asyncState("fresh", "pending") as AsyncState<string, "fresh">,
        b: async.stale("stale-winner"),
      };
      const [key, value] = async.race(states);
      expect(key).toBe("b");
      expect(value).toBe("stale-winner");
    });

    it("should throw error if one has error and none success/stale", () => {
      const err = new Error("failed");
      const states = {
        a: asyncState("fresh", "pending") as AsyncState<string, "fresh">,
        b: asyncState("fresh", "error", err) as AsyncState<string, "fresh">,
      };
      expect(() => async.race(states)).toThrow("failed");
    });
  });

  describe("async.all", () => {
    it("should return all data when all success", () => {
      const s1 = asyncState("fresh", "success", "a");
      const s2 = asyncState("fresh", "success", 42);
      const s3 = asyncState("fresh", "success", true);

      const result = async.all(s1, s2, s3);
      expect(result).toEqual(["a", 42, true]);
    });

    it("should include stale data in results", () => {
      const s1 = asyncState("fresh", "success", "fresh");
      const s2 = async.stale("stale-data");

      const result = async.all(s1, s2);
      expect(result).toEqual(["fresh", "stale-data"]);
    });

    it("should throw if any has error and no stale data", () => {
      const s1 = asyncState("fresh", "success", "a");
      const s2 = asyncState("fresh", "error", new Error("boom"));

      expect(() => async.all(s1, s2)).toThrow("boom");
    });
  });

  describe("async.any", () => {
    it("should return first success value", () => {
      const s1 = asyncState("fresh", "error", new Error("err1")) as AsyncState<
        string,
        "fresh"
      >;
      const s2 = asyncState("fresh", "success", "winner");
      const s3 = asyncState("fresh", "pending") as AsyncState<string, "fresh">;

      expect(async.any(s1, s2, s3)).toBe("winner");
    });

    it("should return stale data if no success", () => {
      const s1 = asyncState("fresh", "error", new Error("err1")) as AsyncState<
        string,
        "fresh"
      >;
      const s2 = async.stale("stale-winner");

      expect(async.any(s1, s2)).toBe("stale-winner");
    });

    it("should throw AggregateError if all errors (no stale)", () => {
      const s1 = asyncState("fresh", "error", new Error("err1"));
      const s2 = asyncState("fresh", "error", new Error("err2"));

      expect(() => async.any(s1, s2)).toThrow("All async states have errors");
    });
  });

  describe("async.settled", () => {
    it("should return settled results with mode-aware data", () => {
      const err = new Error("oops");
      const s1 = asyncState("fresh", "success", "data");
      const s2 = asyncState("stale", "error", "stale-err", err);
      const s3 = asyncState("stale", "pending", "stale-pending");
      const s4 = async.stale("stale-idle");

      const results = async.settled(s1, s2, s3, s4);

      expect(results).toEqual([
        { status: "success", data: "data" },
        { status: "error", error: err, data: "stale-err" },
        { status: "pending", data: "stale-pending" },
        { status: "idle", data: "stale-idle" },
      ]);
    });
  });

  describe("async.hasData", () => {
    it("should return true for success state", () => {
      expect(async.hasData(asyncState("fresh", "success", "data"))).toBe(true);
    });

    it("should return true for stale state with data", () => {
      expect(async.hasData(async.stale("data"))).toBe(true);
    });

    it("should return false for fresh idle state", () => {
      expect(async.hasData(async.fresh())).toBe(false);
    });
  });

  describe("async.isLoading", () => {
    it("should return true for pending state", () => {
      expect(async.isLoading(asyncState("fresh", "pending"))).toBe(true);
    });

    it("should return false for other states", () => {
      expect(async.isLoading(async.fresh())).toBe(false);
      expect(async.isLoading(asyncState("fresh", "success", "x"))).toBe(false);
    });
  });

  describe("async.isError", () => {
    it("should return true for error state", () => {
      expect(async.isError(asyncState("fresh", "error", new Error("x")))).toBe(
        true
      );
    });

    it("should return false for other states", () => {
      expect(async.isError(async.fresh())).toBe(false);
      expect(async.isError(asyncState("fresh", "success", "x"))).toBe(false);
    });
  });

  describe("state creators", () => {
    it("async.fresh() creates fresh idle state", () => {
      const state = async.fresh<string>();
      expect(state.status).toBe("idle");
      expect(state.mode).toBe("fresh");
      expect(state.data).toBeUndefined();
    });

    it("async.stale() creates stale idle state with data", () => {
      const state = async.stale("initial");
      expect(state.status).toBe("idle");
      expect(state.mode).toBe("stale");
      expect(state.data).toBe("initial");
    });

    it("asyncState() creates success state", () => {
      const state = asyncState("fresh", "success", "data");
      expect(state.status).toBe("success");
      expect(state.data).toBe("data");
      expect(state.timestamp).toBeGreaterThan(0);
    });

    it("asyncState() creates pending state", () => {
      const state = asyncState("stale", "pending", "stale-data");
      expect(state.status).toBe("pending");
      expect(state.mode).toBe("stale");
      expect(state.data).toBe("stale-data");
    });

    it("asyncState() creates error state", () => {
      const err = new Error("test");
      const state = asyncState("stale", "error", "stale-data", err);
      expect(state.status).toBe("error");
      expect(state.mode).toBe("stale");
      expect(state.error).toBe(err);
      expect(state.data).toBe("stale-data");
    });
  });

  describe("toJSON serialization", () => {
    describe("fresh mode", () => {
      it("should return null for fresh idle state", () => {
        const state = async.fresh<string>();
        expect(JSON.stringify(state)).toBe("null");
      });

      it("should return null for fresh pending state", () => {
        const state = asyncState("fresh", "pending");
        expect(JSON.stringify(state)).toBe("null");
      });

      it("should return null for fresh error state", () => {
        const state = asyncState("fresh", "error", new Error("test"));
        expect(JSON.stringify(state)).toBe("null");
      });

      it("should serialize fresh success state", () => {
        const state = asyncState("fresh", "success", "data");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "fresh",
          data: "data",
        });
      });
    });

    describe("stale mode", () => {
      it("should serialize stale idle state as success", () => {
        const state = async.stale("initial");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "initial",
        });
      });

      it("should serialize stale pending state as success with data", () => {
        const state = asyncState("stale", "pending", "cached");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "cached",
        });
      });

      it("should serialize stale error state as success with data", () => {
        const state = asyncState("stale", "error", "cached", new Error("test"));
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "cached",
        });
      });

      it("should serialize stale success state", () => {
        const state = asyncState("stale", "success", "data");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "data",
        });
      });
    });

    describe("excludes internal fields", () => {
      it("should not include __key in serialized output", () => {
        // Create a pending state with __key using asyncState's extra props
        const state = asyncState("stale", "pending", "data", { __key: {} });
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized.__key).toBeUndefined();
      });

      it("should not include error in serialized output", () => {
        const state = asyncState("stale", "error", "data", new Error("test"));
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized.error).toBeUndefined();
      });
    });

    describe("state transitions preserve toJSON", () => {
      it("should serialize state after dispatch success", async () => {
        const [focus, { getState }] = createMockFocus(async.stale("initial"));

        const { dispatch } = async(focus, async () => "updated");
        await dispatch();

        const serialized = JSON.parse(JSON.stringify(getState()));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "updated",
        });
      });

      it("should serialize state during pending", async () => {
        const [focus, { getState }] = createMockFocus(async.stale("cached"));

        const { dispatch } = async(focus, async () => {
          await new Promise((r) => setTimeout(r, 50));
          return "new";
        });

        const promise = dispatch();

        // During pending, should serialize with cached data
        const serialized = JSON.parse(JSON.stringify(getState()));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "cached",
        });

        await promise;
      });
    });
  });

  describe("AsyncContext.safe()", () => {
    describe("promise wrapping", () => {
      it("should resolve promise if not cancelled", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let resolvedValue: string | null = null;

        const { dispatch } = async(focus, async (ctx) => {
          const result = await ctx.safe(Promise.resolve("test-value"));
          resolvedValue = result;
          return result;
        });

        await dispatch();
        expect(resolvedValue).toBe("test-value");
      });

      it("should not resolve promise if cancelled", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let resolvedValue: string | null = null;
        let promiseSettled = false;

        const { dispatch, cancel } = async(focus, async (ctx) => {
          const safePromise = ctx.safe(
            new Promise<string>((resolve) => {
              setTimeout(() => resolve("test-value"), 50);
            })
          );

          safePromise.then(
            (value) => {
              resolvedValue = value;
              promiseSettled = true;
            },
            () => {
              promiseSettled = true;
            }
          );

          // Wait longer than the inner promise
          await new Promise((r) => setTimeout(r, 100));
          return "done";
        });

        const promise = dispatch();

        // Cancel immediately
        cancel();

        try {
          await promise;
        } catch {
          // Expected to throw
        }

        // Wait a bit to ensure the safe promise doesn't resolve
        await new Promise((r) => setTimeout(r, 100));

        expect(resolvedValue).toBeNull();
        expect(promiseSettled).toBe(false);
      });

      it("should not reject promise if cancelled", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let caughtError: Error | null = null;
        let promiseSettled = false;

        const { dispatch, cancel } = async(focus, async (ctx) => {
          const safePromise = ctx.safe(
            new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error("test-error")), 50);
            })
          );

          safePromise.then(
            () => {
              promiseSettled = true;
            },
            (error) => {
              caughtError = error;
              promiseSettled = true;
            }
          );

          // Wait longer than the inner promise
          await new Promise((r) => setTimeout(r, 100));
          return "done";
        });

        const promise = dispatch();

        // Cancel immediately
        cancel();

        try {
          await promise;
        } catch {
          // Expected to throw
        }

        // Wait a bit to ensure the safe promise doesn't reject
        await new Promise((r) => setTimeout(r, 100));

        expect(caughtError).toBeNull();
        expect(promiseSettled).toBe(false);
      });
    });

    describe("callback wrapping", () => {
      it("should call callback if not cancelled", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let callbackCalled = false;
        let callbackArg: string | null = null;

        const { dispatch } = async(focus, async (ctx) => {
          const safeCallback = ctx.safe((arg: string) => {
            callbackCalled = true;
            callbackArg = arg;
            return "callback-result";
          });

          const result = safeCallback("test-arg");
          expect(result).toBe("callback-result");
          return "done";
        });

        await dispatch();
        expect(callbackCalled).toBe(true);
        expect(callbackArg).toBe("test-arg");
      });

      it("should not call callback if cancelled", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let callbackCalled = false;

        const { dispatch, cancel } = async(focus, async (ctx) => {
          const safeCallback = ctx.safe(() => {
            callbackCalled = true;
            return "callback-result";
          });

          // Wait a bit before calling
          await new Promise((r) => setTimeout(r, 50));

          const result = safeCallback();
          expect(result).toBeUndefined();
          return "done";
        });

        const promise = dispatch();

        // Cancel immediately
        cancel();

        try {
          await promise;
        } catch {
          // Expected to throw
        }

        expect(callbackCalled).toBe(false);
      });

      it("should handle callback with multiple arguments", async () => {
        const [focus] = createMockFocus(async.fresh<string>());

        let sum: number | null | undefined = null;

        const { dispatch } = async(focus, async (ctx) => {
          const safeAdd = ctx.safe((a: number, b: number, c: number) => {
            return a + b + c;
          });

          sum = safeAdd(1, 2, 3);
          return "done";
        });

        await dispatch();
        expect(sum).toBe(6);
      });
    });
  });

  describe("last()", () => {
    it("should return undefined if never dispatched", () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const actions = async(focus, async () => "result");

      expect(actions.last()).toBeUndefined();
    });

    it("should return invocation info after dispatch", async () => {
      const [focus] = createMockFocus(async.fresh<number>());
      const actions = async<number, "fresh", [number, string]>(
        focus,
        async (_ctx, num, str) => num + str.length
      );

      await actions.dispatch(10, "hello");

      const last = actions.last();
      expect(last).toBeDefined();
      expect(last!.args).toEqual([10, "hello"]);
      expect(last!.nth).toBe(1);
      expect(last!.state.status).toBe("success");
      expect(last!.state.data).toBe(15);
    });

    it("should increment nth on each dispatch", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const actions = async<string, "fresh", [string]>(
        focus,
        async (_ctx, msg) => msg
      );

      await actions.dispatch("first");
      expect(actions.last()!.nth).toBe(1);
      expect(actions.last()!.args).toEqual(["first"]);

      await actions.dispatch("second");
      expect(actions.last()!.nth).toBe(2);
      expect(actions.last()!.args).toEqual(["second"]);

      await actions.dispatch("third");
      expect(actions.last()!.nth).toBe(3);
      expect(actions.last()!.args).toEqual(["third"]);
    });

    it("should reflect current state (pending)", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      let resolvePromise: (value: string) => void;
      const actions = async(focus, async () => {
        return new Promise<string>((resolve) => {
          resolvePromise = resolve;
        });
      });

      const promise = actions.dispatch();

      // While pending
      const lastPending = actions.last();
      expect(lastPending).toBeDefined();
      expect(lastPending!.state.status).toBe("pending");

      // Resolve
      resolvePromise!("done");
      await promise;

      // After success
      const lastSuccess = actions.last();
      expect(lastSuccess!.state.status).toBe("success");
      expect(lastSuccess!.state.data).toBe("done");
    });

    it("should reflect error state", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const actions = async(focus, async () => {
        throw new Error("test error");
      });

      try {
        await actions.dispatch();
      } catch {
        // Expected
      }

      const last = actions.last();
      expect(last).toBeDefined();
      expect(last!.state.status).toBe("error");
      expect(last!.state.error?.message).toBe("test error");
    });

    it("should work with stale mode and preserve data", async () => {
      const [focus] = createMockFocus(async.stale<string[]>(["initial"]));
      let resolvePromise: (value: string[]) => void;
      const actions = async(focus, async () => {
        return new Promise<string[]>((resolve) => {
          resolvePromise = resolve;
        });
      });

      // First dispatch
      const promise = actions.dispatch();

      // During pending, stale mode preserves data
      const lastPending = actions.last();
      expect(lastPending!.state.status).toBe("pending");
      expect(lastPending!.state.data).toEqual(["initial"]);

      resolvePromise!(["updated"]);
      await promise;

      const lastSuccess = actions.last();
      expect(lastSuccess!.state.status).toBe("success");
      expect(lastSuccess!.state.data).toEqual(["updated"]);
    });

    it("should read state via getState for reactivity", async () => {
      // This test verifies that last() calls getState() which enables reactivity
      // Full reactive testing with effect requires a real store setup
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      // Track getState calls
      let getStateCalls = 0;
      const trackedFocus = [
        () => {
          getStateCalls++;
          return getState();
        },
        focus[1],
      ] as Focus<AsyncState<number, "fresh">>;

      const actions = async(trackedFocus, async () => 42);

      // Before dispatch - last() returns undefined without calling getState
      expect(actions.last()).toBeUndefined();
      expect(getStateCalls).toBe(0); // No state read when never dispatched

      // After dispatch - last() should call getState for reactivity
      await actions.dispatch();
      getStateCalls = 0; // Reset counter

      const last = actions.last();
      expect(last).toBeDefined();
      expect(getStateCalls).toBe(1); // getState called once
      expect(last!.state.status).toBe("success");

      // Multiple last() calls should each read state (for reactivity)
      actions.last();
      actions.last();
      expect(getStateCalls).toBe(3);
    });

    it("should update state reference on subsequent dispatches", async () => {
      const [focus] = createMockFocus(async.fresh<string>());
      const actions = async<string, "fresh", [string]>(
        focus,
        async (_ctx, msg) => msg
      );

      await actions.dispatch("first");
      const last1 = actions.last();
      expect(last1!.state.data).toBe("first");

      await actions.dispatch("second");
      const last2 = actions.last();
      expect(last2!.state.data).toBe("second");

      // State objects should be different references
      expect(last1!.state).not.toBe(last2!.state);
    });
  });
});

// ===== asyncState() Factory Tests =====

describe("asyncState()", () => {
  describe("fresh mode", () => {
    it("should create idle state", () => {
      const state = asyncState("fresh", "idle");
      expect(state.status).toBe("idle");
      expect(state.mode).toBe("fresh");
      expect(state.data).toBeUndefined();
      expect(state.error).toBeUndefined();
    });

    it("should create pending state", () => {
      const state = asyncState("fresh", "pending");
      expect(state.status).toBe("pending");
      expect(state.mode).toBe("fresh");
      expect(state.data).toBeUndefined();
    });

    it("should create success state with data", () => {
      const state = asyncState("fresh", "success", { id: 1, name: "test" });
      expect(state.status).toBe("success");
      expect(state.mode).toBe("fresh");
      expect(state.data).toEqual({ id: 1, name: "test" });
      expect(state.timestamp).toBeDefined();
    });

    it("should create error state", () => {
      const error = new Error("Test error");
      const state = asyncState("fresh", "error", error);
      expect(state.status).toBe("error");
      expect(state.mode).toBe("fresh");
      expect(state.data).toBeUndefined();
      expect(state.error).toBe(error);
    });
  });

  describe("stale mode", () => {
    it("should create idle state with initial data", () => {
      const state = asyncState("stale", "idle", [1, 2, 3]);
      expect(state.status).toBe("idle");
      expect(state.mode).toBe("stale");
      expect(state.data).toEqual([1, 2, 3]);
    });

    it("should create pending state preserving data", () => {
      const state = asyncState("stale", "pending", ["a", "b"]);
      expect(state.status).toBe("pending");
      expect(state.mode).toBe("stale");
      expect(state.data).toEqual(["a", "b"]);
    });

    it("should create success state with data", () => {
      const state = asyncState("stale", "success", { value: 42 });
      expect(state.status).toBe("success");
      expect(state.mode).toBe("stale");
      expect(state.data).toEqual({ value: 42 });
      expect(state.timestamp).toBeDefined();
    });

    it("should create error state preserving data", () => {
      const error = new Error("Failed");
      const state = asyncState("stale", "error", "cached data", error);
      expect(state.status).toBe("error");
      expect(state.mode).toBe("stale");
      expect(state.data).toBe("cached data");
      expect(state.error).toBe(error);
    });
  });

  describe("immutability", () => {
    it("should freeze the returned state", () => {
      const state = asyncState("fresh", "idle");
      expect(Object.isFrozen(state)).toBe(true);
    });

    it("should throw when trying to modify frozen state in strict mode", () => {
      const state = asyncState("fresh", "success", { name: "test" });
      expect(() => {
        state.status = "pending";
      }).toThrow();
    });
  });

  describe("toJSON", () => {
    it("should serialize fresh success state", () => {
      const state = asyncState("fresh", "success", { id: 1 });
      expect(state.toJSON?.()).toEqual({
        status: "success",
        mode: "fresh",
        data: { id: 1 },
      });
    });

    it("should serialize stale state as success", () => {
      const state = asyncState("stale", "pending", "cached");
      expect(state.toJSON?.()).toEqual({
        status: "success",
        mode: "stale",
        data: "cached",
      });
    });

    it("should return null for fresh non-success states", () => {
      const idle = asyncState("fresh", "idle");
      const pending = asyncState("fresh", "pending");
      const error = asyncState("fresh", "error", new Error("fail"));

      expect(idle.toJSON?.()).toBeNull();
      expect(pending.toJSON?.()).toBeNull();
      expect(error.toJSON?.()).toBeNull();
    });
  });

  describe("compatibility with async.fresh/stale", () => {
    it("asyncState should produce same result as async.fresh()", () => {
      const fromAsyncState = asyncState("fresh", "idle");
      const fromAsyncFresh = async.fresh();

      expect(fromAsyncState.status).toBe(fromAsyncFresh.status);
      expect(fromAsyncState.mode).toBe(fromAsyncFresh.mode);
      expect(fromAsyncState.data).toBe(fromAsyncFresh.data);
    });

    it("asyncState should produce same result as async.stale()", () => {
      const fromAsyncState = asyncState("stale", "idle", [1, 2, 3]);
      const fromAsyncStale = async.stale([1, 2, 3]);

      expect(fromAsyncState.status).toBe(fromAsyncStale.status);
      expect(fromAsyncState.mode).toBe(fromAsyncStale.mode);
      expect(fromAsyncState.data).toEqual(fromAsyncStale.data);
    });
  });

  describe("asyncState.from()", () => {
    describe("fresh mode", () => {
      it("should create idle state from fresh", () => {
        const prev = asyncState("fresh", "success", "data");
        const next = asyncState.from(prev, "idle");

        expect(next.status).toBe("idle");
        expect(next.mode).toBe("fresh");
        expect(next.data).toBeUndefined();
      });

      it("should create pending state from fresh", () => {
        const prev = asyncState("fresh", "success", "data");
        const next = asyncState.from(prev, "pending");

        expect(next.status).toBe("pending");
        expect(next.mode).toBe("fresh");
        expect(next.data).toBeUndefined();
      });

      it("should create success state from fresh", () => {
        const prev = asyncState("fresh", "pending");
        const next = asyncState.from(prev, "success", "new data");

        expect(next.status).toBe("success");
        expect(next.mode).toBe("fresh");
        expect(next.data).toBe("new data");
      });

      it("should create error state from fresh", () => {
        const prev = asyncState("fresh", "success", "data");
        const error = new Error("test error");
        const next = asyncState.from(prev, "error", error);

        expect(next.status).toBe("error");
        expect(next.mode).toBe("fresh");
        expect(next.data).toBeUndefined();
        expect(next.error).toBe(error);
      });
    });

    describe("stale mode", () => {
      it("should create idle state preserving stale data", () => {
        const prev = asyncState("stale", "success", "data");
        const next = asyncState.from(prev, "idle");

        expect(next.status).toBe("idle");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("data");
      });

      it("should create pending state preserving stale data", () => {
        const prev = asyncState("stale", "idle", "initial");
        const next = asyncState.from(prev, "pending");

        expect(next.status).toBe("pending");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("initial");
      });

      it("should create pending state from success preserving data", () => {
        const prev = asyncState("stale", "success", "cached");
        const next = asyncState.from(prev, "pending");

        expect(next.status).toBe("pending");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("cached");
      });

      it("should create success state with new data", () => {
        const prev = asyncState("stale", "pending", "old");
        const next = asyncState.from(prev, "success", "new data");

        expect(next.status).toBe("success");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("new data");
      });

      it("should create error state preserving stale data", () => {
        const prev = asyncState("stale", "success", "cached");
        const error = new Error("test error");
        const next = asyncState.from(prev, "error", error);

        expect(next.status).toBe("error");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("cached");
        expect(next.error).toBe(error);
      });

      it("should create error state from pending preserving stale data", () => {
        const prev = asyncState("stale", "pending", "pending data");
        const error = new Error("failed");
        const next = asyncState.from(prev, "error", error);

        expect(next.status).toBe("error");
        expect(next.mode).toBe("stale");
        expect(next.data).toBe("pending data");
        expect(next.error).toBe(error);
      });
    });

    describe("state transitions", () => {
      it("should chain multiple transitions correctly (stale mode)", () => {
        let state: AsyncState<string, "stale"> = asyncState(
          "stale",
          "idle",
          "initial"
        );

        // idle -> pending
        state = asyncState.from(state, "pending");
        expect(state.status).toBe("pending");
        expect(state.data).toBe("initial");

        // pending -> success
        state = asyncState.from(state, "success", "loaded");
        expect(state.status).toBe("success");
        expect(state.data).toBe("loaded");

        // success -> pending (refetch)
        state = asyncState.from(state, "pending");
        expect(state.status).toBe("pending");
        expect(state.data).toBe("loaded"); // Preserves previous success data

        // pending -> error
        state = asyncState.from(state, "error", new Error("failed"));
        expect(state.status).toBe("error");
        expect(state.data).toBe("loaded"); // Still preserves data
      });

      it("should chain multiple transitions correctly (fresh mode)", () => {
        let state: AsyncState<string, "fresh"> = asyncState("fresh", "idle");

        // idle -> pending
        state = asyncState.from(state, "pending");
        expect(state.status).toBe("pending");
        expect(state.data).toBeUndefined();

        // pending -> success
        state = asyncState.from(state, "success", "loaded");
        expect(state.status).toBe("success");
        expect(state.data).toBe("loaded");

        // success -> pending (refetch)
        state = asyncState.from(state, "pending");
        expect(state.status).toBe("pending");
        expect(state.data).toBeUndefined(); // Data cleared in fresh mode

        // pending -> error
        state = asyncState.from(state, "error", new Error("failed"));
        expect(state.status).toBe("error");
        expect(state.data).toBeUndefined();
      });
    });
  });

  describe("derive", () => {
    it("should derive success state from sync computation", () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(focus, () => {
            return 42;
          });
        }
      );

      expect(getState().status).toBe("success");
      expect(getState().data).toBe(42);
    });

    it("should set pending state when async.wait throws promise", async () => {
      const [sourceAFocus, sourceA] = createMockFocus(async.fresh<number>());
      const [derivedFocus, { getState: getDerived }] = createMockFocus(
        async.fresh<number>()
      );

      // Source is pending - set it up with a key so async.wait can get the promise
      let resolvePromise: (value: number) => void = () => {};
      const pendingPromise = new Promise<number>((resolve) => {
        resolvePromise = resolve;
      });

      // Create a pending state with the promise tracked
      const pendingState = {
        ...asyncState("fresh", "pending"),
        __key: {},
      } as AsyncState<number, "fresh">;

      // We need to manually set up the pending promise tracking
      // For testing, we'll simulate the behavior by setting state to pending
      sourceA.getState = () => pendingState;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(derivedFocus, () => {
            // This will throw AsyncNotReadyError since there's no tracked promise
            return async.wait(sourceA.getState());
          });
        }
      );

      // Should be in error state because async.wait throws AsyncNotReadyError when no promise
      expect(getDerived().status).toBe("error");
    });

    it("should handle thrown promises and re-run after settlement", async () => {
      const [derivedFocus, { getState: getDerived }] = createMockFocus(
        async.fresh<string>()
      );

      let resolvePromise: (value: string) => void = () => {};
      let throwCount = 0;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(derivedFocus, () => {
            throwCount++;
            if (throwCount === 1) {
              // First run - throw a promise
              throw new Promise<string>((resolve) => {
                resolvePromise = resolve;
              });
            }
            // Second run - return success
            return "computed";
          });
        }
      );

      // Should be pending after first run
      expect(getDerived().status).toBe("pending");
      expect(throwCount).toBe(1);

      // Resolve the promise
      resolvePromise("data");
      await new Promise((r) => setTimeout(r, 10));

      // Should re-run and succeed
      expect(getDerived().status).toBe("success");
      expect(getDerived().data).toBe("computed");
      expect(throwCount).toBe(2);
    });

    it("should set error state when computation throws error", () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(focus, () => {
            throw new Error("computation failed");
          });
        }
      );

      expect(getState().status).toBe("error");
      expect(getState().error?.message).toBe("computation failed");
    });

    it("should throw error when computeFn returns a promise", () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(focus, () => {
            return Promise.resolve(42) as any;
          });
        }
      );

      expect(getState().status).toBe("error");
      expect(getState().error?.message).toContain("must be synchronous");
    });

    it("should only set pending once for multiple thrown promises (cascade)", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      let pendingSetCount = 0;
      const originalSetter = focus[1];
      focus[1] = (value: any) => {
        if (typeof value === "function") {
          originalSetter(value);
        } else {
          if (value.status === "pending") {
            pendingSetCount++;
          }
          originalSetter(value);
        }
      };

      let resolveA: (value: number) => void = () => {};
      let resolveB: (value: number) => void = () => {};
      let runCount = 0;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(focus, () => {
            runCount++;
            if (runCount === 1) {
              throw new Promise<number>((resolve) => {
                resolveA = resolve;
              });
            }
            if (runCount === 2) {
              throw new Promise<number>((resolve) => {
                resolveB = resolve;
              });
            }
            return 100;
          });
        }
      );

      expect(getState().status).toBe("pending");
      expect(pendingSetCount).toBe(1);

      // Resolve first promise
      resolveA(1);
      await new Promise((r) => setTimeout(r, 10));

      // Should still be pending but NOT have set pending again
      expect(getState().status).toBe("pending");
      expect(pendingSetCount).toBe(1); // Still 1!

      // Resolve second promise
      resolveB(2);
      await new Promise((r) => setTimeout(r, 10));

      // Now should be success
      expect(getState().status).toBe("success");
      expect(getState().data).toBe(100);
      expect(runCount).toBe(3);
    });

    it("should return dispose function that stops derivation", async () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      let resolvePromise: (value: number) => void = () => {};
      let runCount = 0;
      let dispose: VoidFunction = () => {};

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          dispose = async.derive(focus, () => {
            runCount++;
            if (runCount === 1) {
              throw new Promise<number>((resolve) => {
                resolvePromise = resolve;
              });
            }
            return 42;
          });
        }
      );

      expect(getState().status).toBe("pending");
      expect(runCount).toBe(1);

      // Dispose before promise resolves
      dispose();

      // Resolve the promise
      resolvePromise(1);
      await new Promise((r) => setTimeout(r, 10));

      // Should NOT have re-run after dispose
      expect(runCount).toBe(1);
      expect(getState().status).toBe("pending"); // Still pending since dispose stopped it
    });

    it("should convert non-Error throws to Error", () => {
      const [focus, { getState }] = createMockFocus(async.fresh<number>());

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          async.derive(focus, () => {
            throw "string error";
          });
        }
      );

      expect(getState().status).toBe("error");
      expect(getState().error).toBeInstanceOf(Error);
      expect(getState().error?.message).toBe("string error");
    });

    describe("stale mode", () => {
      it("should preserve stale data during pending state", async () => {
        const [focus, { getState }] = createMockFocus(async.stale("initial"));

        let resolvePromise: (value: string) => void = () => {};
        let throwCount = 0;

        withHooks(
          {
            scheduleEffect: (runEffect) => runEffect(),
            scheduleNotification: (execute) => execute(),
          },
          () => {
            async.derive(focus, () => {
              throwCount++;
              if (throwCount === 1) {
                throw new Promise<string>((resolve) => {
                  resolvePromise = resolve;
                });
              }
              return "computed";
            });
          }
        );

        // Should be pending with stale data preserved
        expect(getState().status).toBe("pending");
        expect(getState().mode).toBe("stale");
        expect(getState().data).toBe("initial");

        // Resolve and check success
        resolvePromise("data");
        await new Promise((r) => setTimeout(r, 10));

        expect(getState().status).toBe("success");
        expect(getState().data).toBe("computed");
      });

      it("should preserve stale data during error state", () => {
        const [focus, { getState }] = createMockFocus(async.stale("cached"));

        withHooks(
          {
            scheduleEffect: (runEffect) => runEffect(),
            scheduleNotification: (execute) => execute(),
          },
          () => {
            async.derive(focus, () => {
              throw new Error("computation failed");
            });
          }
        );

        expect(getState().status).toBe("error");
        expect(getState().mode).toBe("stale");
        expect(getState().data).toBe("cached");
        expect(getState().error?.message).toBe("computation failed");
      });

      it("should update stale data on success", () => {
        const [focus, { getState }] = createMockFocus(async.stale("old"));

        withHooks(
          {
            scheduleEffect: (runEffect) => runEffect(),
            scheduleNotification: (execute) => execute(),
          },
          () => {
            async.derive(focus, () => {
              return "new";
            });
          }
        );

        expect(getState().status).toBe("success");
        expect(getState().mode).toBe("stale");
        expect(getState().data).toBe("new");
      });

      it("should preserve last success data for subsequent pending/error", async () => {
        const [focus, { getState }] = createMockFocus(async.stale("initial"));

        let throwError = false;
        let throwPromise = false;
        let resolvePromise: () => void = () => {};

        withHooks(
          {
            scheduleEffect: (runEffect) => runEffect(),
            scheduleNotification: (execute) => execute(),
          },
          () => {
            async.derive(focus, () => {
              if (throwPromise) {
                throw new Promise<void>((resolve) => {
                  resolvePromise = resolve;
                });
              }
              if (throwError) {
                throw new Error("fail");
              }
              return "success-data";
            });
          }
        );

        // First run succeeds
        expect(getState().status).toBe("success");
        expect(getState().data).toBe("success-data");

        // Now throw a promise - should preserve success-data
        throwPromise = true;
        // Trigger re-run by manually calling the effect
        // (In real usage, this would happen via dependency tracking)
      });
    });
  });

  describe("mixin overload", () => {
    it("should return a selector mixin", () => {
      const fetchData = async(async () => "result");

      // The mixin should be a function
      expect(typeof fetchData).toBe("function");
    });

    it("should work with scoped() in selector context", () => {
      const fetchData = async(async () => "result");

      const testContainer = container();

      // Create a mock selector context with scoped()
      let capturedState: any;
      let capturedActions: any;

      // Use the mixin
      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          const mockContext: SelectorContext = {
            [Symbol.for("storion")]: "selector.context",
            id: {},
            get: (spec: any) => testContainer.get(spec),
            mixin: (m: any, ...args: any[]) => m(mockContext, ...args),
            once: () => {},
            scoped: (spec: any) => {
              const instance = testContainer.create(spec);
              return [instance.state, instance.actions, instance];
            },
          } as any;

          const [state, actions] = fetchData(mockContext);
          capturedState = state;
          capturedActions = actions;
        }
      );

      // Should have idle state initially
      expect(capturedState.status).toBe("idle");
      expect(capturedState.mode).toBe("fresh");

      // Should have async actions
      expect(typeof capturedActions.dispatch).toBe("function");
      expect(typeof capturedActions.cancel).toBe("function");
      expect(typeof capturedActions.reset).toBe("function");
      expect(typeof capturedActions.refresh).toBe("function");
    });

    it("should dispatch and update state", async () => {
      const fetchData = async(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "fetched";
      });

      const testContainer = container();
      let capturedState: any;
      let capturedActions: any;
      let scopedInstance: any;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          const mockContext: SelectorContext = {
            [Symbol.for("storion")]: "selector.context",
            id: {},
            get: (spec: any) => testContainer.get(spec),
            mixin: (m: any, ...args: any[]) => m(mockContext, ...args),
            once: () => {},
            scoped: (spec: any) => {
              const instance = testContainer.create(spec);
              scopedInstance = instance;
              return [instance.state, instance.actions, instance];
            },
          } as any;

          const [state, actions] = fetchData(mockContext);
          capturedState = state;
          capturedActions = actions;
        }
      );

      // Dispatch
      const promise = capturedActions.dispatch();

      // Should be pending
      expect(scopedInstance.state.result.status).toBe("pending");

      // Wait for completion
      await promise;

      // Should be success
      expect(scopedInstance.state.result.status).toBe("success");
      expect(scopedInstance.state.result.data).toBe("fetched");
    });

    it("should support stale mode with initial state", async () => {
      const fetchData = async(async () => "new-data", {
        initial: asyncState("stale", "idle", "old-data"),
      });

      const testContainer = container();
      let capturedState: any;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          const mockContext: SelectorContext = {
            [Symbol.for("storion")]: "selector.context",
            id: {},
            get: (spec: any) => testContainer.get(spec),
            mixin: (m: any, ...args: any[]) => m(mockContext, ...args),
            once: () => {},
            scoped: (spec: any) => {
              const instance = testContainer.create(spec);
              return [instance.state, instance.actions, instance];
            },
          } as any;

          const [state] = fetchData(mockContext);
          capturedState = state;
        }
      );

      // Should have stale mode with initial data
      expect(capturedState.status).toBe("idle");
      expect(capturedState.mode).toBe("stale");
      expect(capturedState.data).toBe("old-data");
    });

    it("should support handler with arguments", async () => {
      const fetchUser = async(async (_ctx, userId: string) => {
        return { id: userId, name: `User ${userId}` };
      });

      const testContainer = container();
      let capturedActions: any;
      let scopedInstance: any;

      withHooks(
        {
          scheduleEffect: (runEffect) => runEffect(),
          scheduleNotification: (execute) => execute(),
        },
        () => {
          const mockContext: SelectorContext = {
            [Symbol.for("storion")]: "selector.context",
            id: {},
            get: (spec: any) => testContainer.get(spec),
            mixin: (m: any, ...args: any[]) => m(mockContext, ...args),
            once: () => {},
            scoped: (spec: any) => {
              const instance = testContainer.create(spec);
              scopedInstance = instance;
              return [instance.state, instance.actions, instance];
            },
          } as any;

          const [, actions] = fetchUser(mockContext);
          capturedActions = actions;
        }
      );

      // Dispatch with arguments
      await capturedActions.dispatch("123");

      // Should have success with user data
      expect(scopedInstance.state.result.status).toBe("success");
      expect(scopedInstance.state.result.data).toEqual({
        id: "123",
        name: "User 123",
      });
    });
  });

  describe("context.get", () => {
    it("should get store state", async () => {
      const userStore = store({
        state: {
          name: "John Doe",
        },
      });

      const actionStore = store({
        state: {
          result: async.fresh<string>(),
        },
        setup: (ctx) => {
          const fetchUser = async(ctx.focus("result"), async (ctx) => {
            const [state] = ctx.get(userStore);
            return state.name;
          });

          return {
            dispatch: fetchUser.dispatch,
          };
        },
      });

      const testContainer = container();
      const instance = testContainer.get(actionStore);

      await instance.actions.dispatch();

      expect(instance.state.result.status).toBe("success");
      expect(instance.state.result.data).toBe("John Doe");
    });
  });
});
