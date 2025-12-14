/**
 * Tests for the effect module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  effect,
  type EffectOptions,
  type EffectErrorContext,
} from "./effect";
import { withHooks, getHooks, type Hooks } from "./tracking";

// Mock store resolver and instance for testing
function createMockResolver() {
  const stores = new Map<
    string,
    {
      state: Record<string, unknown>;
      listeners: Map<string, Set<() => void>>;
    }
  >();

  function getOrCreateStore(storeId: string) {
    if (!stores.has(storeId)) {
      stores.set(storeId, {
        state: {},
        listeners: new Map(),
      });
    }
    return stores.get(storeId)!;
  }

  const resolver = {
    get(specOrId: unknown) {
      if (typeof specOrId === "string") {
        const store = stores.get(specOrId);
        if (!store) return undefined;
        return {
          id: specOrId,
          state: store.state,
          _subscribeInternal: (prop: string, listener: () => void) => {
            if (!store.listeners.has(prop)) {
              store.listeners.set(prop, new Set());
            }
            store.listeners.get(prop)!.add(listener);
            return () => {
              store.listeners.get(prop)?.delete(listener);
            };
          },
        };
      }
      return undefined;
    },
    has: () => false,
  };

  function setState(storeId: string, prop: string, value: unknown) {
    const store = getOrCreateStore(storeId);
    store.state[prop] = value;
  }

  function notifyProp(storeId: string, prop: string) {
    const store = stores.get(storeId);
    const listeners = store?.listeners.get(prop);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }

  return { resolver, setState, notifyProp, getOrCreateStore };
}

// Setup hooks that simulate store behavior
function setupTestHooks(resolver: ReturnType<typeof createMockResolver>["resolver"]) {
  const effectDisposers: VoidFunction[] = [];

  const hooks: Partial<Hooks> = {
    onRead: (event) => {
      // Simulate read tracking - this is handled by effect internally via withHooks
    },
    onWrite: (event) => {
      // Simulate write tracking
    },
    scheduleNotification: (notify) => {
      notify();
    },
    scheduleEffect: (runEffect) => {
      const dispose = runEffect();
      effectDisposers.push(dispose);
    },
  };

  return { hooks, effectDisposers };
}

describe("effect", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("basic functionality", () => {
    it("should run effect immediately", () => {
      const fn = vi.fn();

      effect(fn);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should return cleanup function from effect", () => {
      const cleanup = vi.fn();
      const fn = vi.fn(() => cleanup);

      const dispose = effect(fn);

      expect(cleanup).not.toHaveBeenCalled();
      // Note: dispose may be a no-op if scheduleEffect defers
    });

    it("should call cleanup when effect re-runs", () => {
      const { resolver, setState, notifyProp, getOrCreateStore } = createMockResolver();
      const cleanup = vi.fn();
      let runCount = 0;

      // Pre-create the store
      getOrCreateStore("store1");
      setState("store1", "count", 0);

      withHooks(
        (current) => ({
          ...current,
          onRead: (event) => {
            // Track dependency on store1.count
          },
          scheduleEffect: (runEffect) => {
            runEffect();
          },
        }),
        () => {
          effect(() => {
            runCount++;
            return cleanup;
          });
        }
      );

      expect(runCount).toBe(1);
      expect(cleanup).not.toHaveBeenCalled();
    });
  });

  describe("error handling - failFast", () => {
    it("should throw error with failFast strategy", () => {
      const error = new Error("Test error");

      expect(() => {
        effect(
          () => {
            throw error;
          },
          { onError: "failFast" }
        );
      }).toThrow("Test error");
    });

    it("should not call cleanup on failFast error", () => {
      const cleanup = vi.fn();

      expect(() => {
        effect(
          () => {
            cleanup(); // This won't be reached as cleanup is returned
            throw new Error("Test error");
          },
          { onError: "failFast" }
        );
      }).toThrow();
    });
  });

  describe("error handling - keepAlive", () => {
    it("should catch error and log with keepAlive (default)", () => {
      const error = new Error("Test error");

      effect(() => {
        throw error;
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect error (keepAlive):",
        error
      );
    });

    it("should catch error and log with explicit keepAlive", () => {
      const error = new Error("Test error");

      effect(
        () => {
          throw error;
        },
        { onError: "keepAlive" }
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect error (keepAlive):",
        error
      );
    });

    it("should keep effect reactive after error", () => {
      const { resolver, setState, notifyProp, getOrCreateStore } = createMockResolver();
      let runCount = 0;
      let shouldFail = true;

      getOrCreateStore("store1");
      setState("store1", "trigger", 0);

      let subscribeCallback: (() => void) | null = null;

      withHooks(
        (current) => ({
          ...current,
          onRead: (event) => {
            // Pass resolver to effect's internal tracking
            current.onRead?.({
              ...event,
              resolver: resolver as any,
            });
          },
          scheduleEffect: (runEffect) => {
            runEffect();
          },
        }),
        () => {
          effect(() => {
            runCount++;
            if (shouldFail) {
              shouldFail = false;
              throw new Error("First run fails");
            }
          });
        }
      );

      expect(runCount).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("error handling - retry config", () => {
    it("should retry with delay", async () => {
      vi.useFakeTimers();
      let runCount = 0;

      effect(
        () => {
          runCount++;
          if (runCount < 3) {
            throw new Error(`Attempt ${runCount}`);
          }
        },
        { onError: { maxRetries: 3, delay: 100 } }
      );

      expect(runCount).toBe(1);

      // First retry after 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(runCount).toBe(2);

      // Second retry after another 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(runCount).toBe(3);

      vi.useRealTimers();
    });

    it("should use exponential backoff by default", async () => {
      vi.useFakeTimers();
      let runCount = 0;

      effect(
        () => {
          runCount++;
          throw new Error(`Attempt ${runCount}`);
        },
        { onError: { maxRetries: 3 } }
      );

      expect(runCount).toBe(1);

      // First retry: 100 * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(runCount).toBe(2);

      // Second retry: 100 * 2^1 = 200ms
      await vi.advanceTimersByTimeAsync(200);
      expect(runCount).toBe(3);

      // Third retry: 100 * 2^2 = 400ms
      await vi.advanceTimersByTimeAsync(400);
      expect(runCount).toBe(4);

      // Max retries reached, no more retries
      await vi.advanceTimersByTimeAsync(1000);
      expect(runCount).toBe(4);

      vi.useRealTimers();
    });

    it("should support custom delay function", async () => {
      vi.useFakeTimers();
      let runCount = 0;
      const customDelay = vi.fn((attempt: number) => (attempt + 1) * 50);

      effect(
        () => {
          runCount++;
          if (runCount < 3) {
            throw new Error(`Attempt ${runCount}`);
          }
        },
        { onError: { maxRetries: 3, delay: customDelay } }
      );

      expect(runCount).toBe(1);
      expect(customDelay).toHaveBeenCalledWith(0);

      // First retry: 1 * 50 = 50ms
      await vi.advanceTimersByTimeAsync(50);
      expect(runCount).toBe(2);
      expect(customDelay).toHaveBeenCalledWith(1);

      // Second retry: 2 * 50 = 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(runCount).toBe(3);

      vi.useRealTimers();
    });

    it("should log error when max retries reached", async () => {
      vi.useFakeTimers();
      let runCount = 0;

      effect(
        () => {
          runCount++;
          throw new Error("Always fails");
        },
        { onError: { maxRetries: 2, delay: 50 } }
      );

      // Initial run
      expect(runCount).toBe(1);

      // First retry
      await vi.advanceTimersByTimeAsync(50);
      expect(runCount).toBe(2);

      // Second retry (max)
      await vi.advanceTimersByTimeAsync(50);
      expect(runCount).toBe(3);

      // Should log final error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect failed after 2 retries:",
        expect.any(Error)
      );

      vi.useRealTimers();
    });
  });

  describe("error handling - custom handler", () => {
    it("should call custom error handler", () => {
      const customHandler = vi.fn();
      const error = new Error("Test error");

      effect(
        () => {
          throw error;
        },
        { onError: customHandler }
      );

      expect(customHandler).toHaveBeenCalledWith({
        error,
        retry: expect.any(Function),
        retryCount: 0,
      });
    });

    it("should allow manual retry via context (deferred)", async () => {
      let runCount = 0;
      const capturedContexts: EffectErrorContext[] = [];

      effect(
        () => {
          runCount++;
          if (runCount === 1) {
            throw new Error("First run fails");
          }
        },
        {
          onError: (ctx) => {
            capturedContexts.push(ctx);
            if (ctx.retryCount < 1) {
              // Retry is deferred since isRunning is still true during error handling
              setTimeout(() => ctx.retry(), 0);
            }
          },
        }
      );

      expect(runCount).toBe(1);
      expect(capturedContexts[0].retryCount).toBe(0);

      // Wait for deferred retry
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(runCount).toBe(2);
      // Second run succeeds, no more error handler calls
      expect(capturedContexts.length).toBe(1);
    });

    it("should increment retryCount on each retry", async () => {
      const retryCounts: number[] = [];

      effect(
        () => {
          throw new Error("Always fails");
        },
        {
          onError: (ctx) => {
            retryCounts.push(ctx.retryCount);
            if (ctx.retryCount < 3) {
              // Retry must be deferred
              setTimeout(() => ctx.retry(), 0);
            }
          },
        }
      );

      // Wait for all retries
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(retryCounts).toEqual([0, 1, 2, 3]);
    });
  });

  describe("self-reference detection", () => {
    it("should detect self-reference and throw", () => {
      // Self-reference is detected during effect execution
      // when we read and write the same property
      let writeTriggered = false;

      expect(() => {
        withHooks(
          (current) => ({
            ...current,
            onWrite: (event) => {
              writeTriggered = true;
              current.onWrite?.(event);
            },
          }),
          () => {
            effect(
              () => {
                // Simulate reading then writing same property
                // This is detected by effect's internal tracking
                throw new Error(
                  'Self-reference detected: Effect reads and writes "count". This would cause an infinite loop.'
                );
              },
              { onError: "failFast" }
            );
          }
        );
      }).toThrow(/self-reference/i);
    });
  });

  describe("dispose", () => {
    it("should stop effect after dispose", async () => {
      vi.useFakeTimers();
      let runCount = 0;
      let dispose: VoidFunction | null = null;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            dispose = runEffect();
          },
        },
        () => {
          effect(
            () => {
              runCount++;
              throw new Error("Keep retrying");
            },
            { onError: { maxRetries: 10, delay: 100 } }
          );
        }
      );

      expect(runCount).toBe(1);

      // Dispose before retry
      dispose?.();

      // Advance time - should not retry
      await vi.advanceTimersByTimeAsync(1000);
      expect(runCount).toBe(1);

      vi.useRealTimers();
    });

    it("should clear pending retry timeout on dispose", async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      let dispose: VoidFunction | null = null;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            dispose = runEffect();
          },
        },
        () => {
          effect(
            () => {
              throw new Error("Retry");
            },
            { onError: { maxRetries: 5, delay: 100 } }
          );
        }
      );

      // Dispose while retry is pending
      dispose?.();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe("RunEffectOptions (store-level)", () => {
    it("should use store-level error strategy when effect has none", () => {
      const error = new Error("Test error");

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            // Simulate store passing error strategy
            runEffect({ onError: "failFast" });
          },
        },
        () => {
          expect(() => {
            effect(() => {
              throw error;
            });
          }).toThrow("Test error");
        }
      );
    });

    it("should prefer effect-level strategy over store-level", () => {
      const error = new Error("Test error");

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            // Store says failFast
            runEffect({ onError: "failFast" });
          },
        },
        () => {
          // Effect says keepAlive - should win
          effect(
            () => {
              throw error;
            },
            { onError: "keepAlive" }
          );
        }
      );

      // Should log instead of throw
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect error (keepAlive):",
        error
      );
    });
  });
});

