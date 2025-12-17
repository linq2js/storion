import { describe, it, expect, vi } from "vitest";
import { async } from "./async";
import type { AsyncState, AsyncMode } from "./types";
import type { Focus } from "../types";

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
        async.success("initial", "stale")
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

    it("should reject if no previous dispatch", async () => {
      const [focus] = createMockFocus(async.fresh<string>());

      const { refresh } = async(focus, async () => "done");

      await expect(refresh()).rejects.toThrow("no previous dispatch");
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
      const state = async.success("hello");
      expect(async.wait(state)).toBe("hello");
    });

    it("should return stale data in stale mode", () => {
      const state = async.stale("stale-data");
      expect(async.wait(state)).toBe("stale-data");
    });

    it("should throw error for error state in fresh mode", () => {
      const state = async.error(new Error("failed"));
      expect(() => async.wait(state)).toThrow("failed");
    });

    it("should return stale data for error state in stale mode", () => {
      const state = async.error(new Error("failed"), "stale", "stale-data");
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
        a: async.pending("fresh"),
        b: async.success("winner"),
        c: async.fresh<string>(),
      };
      const [key, value] = async.race(states);
      expect(key).toBe("b");
      expect(value).toBe("winner");
    });

    it("should return stale data as winner", () => {
      const states = {
        a: async.pending("fresh"),
        b: async.stale("stale-winner"),
      };
      const [key, value] = async.race(states);
      expect(key).toBe("b");
      expect(value).toBe("stale-winner");
    });

    it("should throw error if one has error and none success/stale", () => {
      const err = new Error("failed");
      const states = {
        a: async.pending("fresh"),
        b: async.error<string>(err),
      };
      expect(() => async.race(states)).toThrow("failed");
    });
  });

  describe("async.all", () => {
    it("should return all data when all success", () => {
      const s1 = async.success("a");
      const s2 = async.success(42);
      const s3 = async.success(true);

      const result = async.all(s1, s2, s3);
      expect(result).toEqual(["a", 42, true]);
    });

    it("should include stale data in results", () => {
      const s1 = async.success("fresh");
      const s2 = async.stale("stale-data");

      const result = async.all(s1, s2);
      expect(result).toEqual(["fresh", "stale-data"]);
    });

    it("should throw if any has error and no stale data", () => {
      const s1 = async.success("a");
      const s2 = async.error(new Error("boom"));

      expect(() => async.all(s1, s2)).toThrow("boom");
    });
  });

  describe("async.any", () => {
    it("should return first success value", () => {
      const s1 = async.error<string>(new Error("err1"));
      const s2 = async.success("winner");
      const s3 = async.pending("fresh");

      expect(async.any(s1, s2, s3)).toBe("winner");
    });

    it("should return stale data if no success", () => {
      const s1 = async.error<string>(new Error("err1"));
      const s2 = async.stale("stale-winner");

      expect(async.any(s1, s2)).toBe("stale-winner");
    });

    it("should throw AggregateError if all errors (no stale)", () => {
      const s1 = async.error(new Error("err1"));
      const s2 = async.error(new Error("err2"));

      expect(() => async.any(s1, s2)).toThrow("All async states have errors");
    });
  });

  describe("async.settled", () => {
    it("should return settled results with mode-aware data", () => {
      const err = new Error("oops");
      const s1 = async.success("data");
      const s2 = async.error(err, "stale", "stale-err");
      const s3 = async.pending("stale", "stale-pending");
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
      expect(async.hasData(async.success("data"))).toBe(true);
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
      expect(async.isLoading(async.pending())).toBe(true);
    });

    it("should return false for other states", () => {
      expect(async.isLoading(async.fresh())).toBe(false);
      expect(async.isLoading(async.success("x"))).toBe(false);
    });
  });

  describe("async.isError", () => {
    it("should return true for error state", () => {
      expect(async.isError(async.error(new Error("x")))).toBe(true);
    });

    it("should return false for other states", () => {
      expect(async.isError(async.fresh())).toBe(false);
      expect(async.isError(async.success("x"))).toBe(false);
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

    it("async.success() creates success state", () => {
      const state = async.success("data");
      expect(state.status).toBe("success");
      expect(state.data).toBe("data");
      expect(state.timestamp).toBeGreaterThan(0);
    });

    it("async.pending() creates pending state", () => {
      const state = async.pending("stale", "stale-data");
      expect(state.status).toBe("pending");
      expect(state.mode).toBe("stale");
      expect(state.data).toBe("stale-data");
    });

    it("async.error() creates error state", () => {
      const err = new Error("test");
      const state = async.error(err, "stale", "stale-data");
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
        const state = async.pending("fresh");
        expect(JSON.stringify(state)).toBe("null");
      });

      it("should return null for fresh error state", () => {
        const state = async.error(new Error("test"), "fresh");
        expect(JSON.stringify(state)).toBe("null");
      });

      it("should serialize fresh success state", () => {
        const state = async.success("data", "fresh");
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
        const state = async.pending("stale", "cached");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "cached",
        });
      });

      it("should serialize stale error state as success with data", () => {
        const state = async.error(new Error("test"), "stale", "cached");
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized).toEqual({
          status: "success",
          mode: "stale",
          data: "cached",
        });
      });

      it("should serialize stale success state", () => {
        const state = async.success("data", "stale");
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
        // Create a pending state with __key
        const state = async.pending("stale", "data");
        (state as any).__key = {}; // Simulate adding __key
        const serialized = JSON.parse(JSON.stringify(state));
        expect(serialized.__key).toBeUndefined();
      });

      it("should not include error in serialized output", () => {
        const state = async.error(new Error("test"), "stale", "data");
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
});
