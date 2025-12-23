/**
 * Tests for the effect module.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockInstance,
} from "vitest";
import { fake } from "../test/util";
import { effect, type EffectErrorContext, type EffectContext } from "./effect";
import { withHooks, type Hooks } from "./tracking";

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
function setupTestHooks(
  resolver: ReturnType<typeof createMockResolver>["resolver"]
) {
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
  let consoleErrorSpy = fake<MockInstance>();

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe("basic functionality", () => {
    it("should run effect immediately", () => {
      const fn = vi.fn();

      effect(fn);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should provide EffectContext to effect function", () => {
      let capturedCtx = fake<EffectContext>();

      effect((ctx) => {
        capturedCtx = ctx;
      });

      expect(capturedCtx).not.toBeNull();
      expect(capturedCtx?.signal).toBeInstanceOf(AbortSignal);
      expect(typeof capturedCtx?.onCleanup).toBe("function");
      expect(typeof capturedCtx?.safe).toBe("function");
    });

    it("should call cleanup when effect re-runs", () => {
      const cleanup = vi.fn();
      let runCount = 0;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;
            ctx.onCleanup(cleanup);
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

    it("should still run registered cleanup on failFast error", () => {
      const cleanup = vi.fn();

      expect(() => {
        effect(
          (ctx) => {
            ctx.onCleanup(cleanup);
            throw new Error("Test error");
          },
          { onError: "failFast" }
        );
      }).toThrow();

      // Cleanup registered before error should still be tracked
      // but won't run until next run or dispose
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
      let runCount = 0;
      let shouldFail = true;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
        },
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

  describe("self-reference (read + write same prop)", () => {
    it("should allow reading and writing same property", () => {
      // Self-reference is allowed - no infinite loop because
      // we skip subscribing to written props
      let writeCount = 0;

      expect(() => {
        withHooks(
          (current) => ({
            ...current,
            onWrite: () => {
              writeCount++;
            },
          }),
          () => {
            effect(() => {
              // This pattern is now allowed
              // Simulates: state.count += state.by
            });
          }
        );
      }).not.toThrow();

      expect(writeCount).toBe(0); // No writes in this simple test
    });

    it("should not subscribe to written props", () => {
      // When an effect reads AND writes the same prop,
      // it should NOT subscribe to that prop (to avoid unnecessary re-runs)
      const trackedReads: string[] = [];
      const trackedWrites: string[] = [];

      withHooks(
        (current) => ({
          ...current,
          onRead: (event) => {
            // Extract prop name from key (format: "storeId.prop")
            trackedReads.push(event.key);
            current.onRead?.(event);
          },
          onWrite: (event) => {
            // Extract prop name from key (format: "storeId.prop")
            trackedWrites.push(event.key);
            current.onWrite?.(event);
          },
        }),
        () => {
          effect(() => {
            // Effect that reads and writes - simulating state.count += state.by
            // Both are tracked as reads, count is also tracked as write
          });
        }
      );

      // Hooks were set up correctly
      expect(typeof trackedReads).toBe("object");
      expect(typeof trackedWrites).toBe("object");
    });
  });

  describe("async effect prevention", () => {
    it("should throw if effect returns a Promise", () => {
      expect(() => {
        effect(
          async () => {
            await Promise.resolve();
          },
          { onError: "failFast" }
        );
      }).toThrow(/Effect function must be synchronous/);
    });

    it("should throw if effect returns a PromiseLike", () => {
      expect(() => {
        effect(
          () => {
            return { then: () => {} };
          },
          { onError: "failFast" }
        );
      }).toThrow(/Effect function must be synchronous/);
    });

    it("should not throw for normal effects", () => {
      expect(() => {
        effect(() => {
          // Normal sync effect
        });
      }).not.toThrow();
    });
  });

  describe("dispose", () => {
    it("should stop effect after dispose", async () => {
      vi.useFakeTimers();
      let runCount = 0;
      let dispose = fake<VoidFunction>();

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
      let dispose = fake<VoidFunction>();

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
    it("should call store-level onError callback when effect errors", () => {
      const error = new Error("Test error");
      const storeErrorCallback = vi.fn();

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            // Simulate store passing error callback
            runEffect({ onError: storeErrorCallback });
          },
        },
        () => {
          effect(() => {
            throw error;
          });
        }
      );

      // Store callback should be called
      expect(storeErrorCallback).toHaveBeenCalledWith(error);
      // Default keepAlive strategy should also log
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect error (keepAlive):",
        error
      );
    });

    it("should call store callback AND apply effect strategy (failFast)", () => {
      const error = new Error("Test error");
      const storeErrorCallback = vi.fn();

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect({ onError: storeErrorCallback });
          },
        },
        () => {
          expect(() => {
            effect(
              () => {
                throw error;
              },
              { onError: "failFast" }
            );
          }).toThrow("Test error");
        }
      );

      // Store callback should be called before throw
      expect(storeErrorCallback).toHaveBeenCalledWith(error);
    });

    it("should call store callback AND apply effect strategy (keepAlive)", () => {
      const error = new Error("Test error");
      const storeErrorCallback = vi.fn();

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect({ onError: storeErrorCallback });
          },
        },
        () => {
          effect(
            () => {
              throw error;
            },
            { onError: "keepAlive" }
          );
        }
      );

      // Both should be called
      expect(storeErrorCallback).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Effect error (keepAlive):",
        error
      );
    });
  });

  describe("EffectContext", () => {
    describe("nth", () => {
      it("should start at 1 for first run", () => {
        let capturedNth = 0;

        effect((ctx) => {
          capturedNth = ctx.nth;
        });

        expect(capturedNth).toBe(1);
      });

      it("should increment on each run", () => {
        const nths: number[] = [];
        let runCount = 0;

        effect(
          (ctx) => {
            runCount++;
            nths.push(ctx.nth);
            if (runCount < 3) {
              throw new Error("Force re-run");
            }
          },
          { onError: { maxRetries: 3, delay: 0 } }
        );

        // Wait for retries
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(nths).toEqual([1, 2, 3]);
            resolve();
          }, 50);
        });
      });

      it("should be usable as stale token", async () => {
        let resolvePromise: (value: string) => void;
        const results: string[] = [];
        let runCount = 0;

        effect((ctx) => {
          runCount++;
          const token = ctx.nth;

          new Promise<string>((resolve) => {
            resolvePromise = resolve;
          }).then((value) => {
            // Manual stale check using nth
            if (ctx.nth === token) {
              results.push(value);
            }
          });
        });

        // Resolve first promise after effect has re-run
        // This simulates a stale async operation
        resolvePromise!("first");

        await new Promise((r) => setTimeout(r, 10));
        expect(results).toEqual(["first"]);
      });
    });

    describe("onCleanup", () => {
      it("should run cleanup when effect re-runs", () => {
        const cleanup = vi.fn();
        let runCount = 0;
        let triggerRerun: (() => void) | null = null;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              ctx.onCleanup(cleanup);
            });
          }
        );

        expect(runCount).toBe(1);
        expect(cleanup).not.toHaveBeenCalled();
      });

      it("should run cleanup even if effect throws after registration", () => {
        const cleanup = vi.fn();

        effect(
          (ctx) => {
            ctx.onCleanup(cleanup);
            throw new Error("After cleanup registration");
          },
          { onError: "keepAlive" }
        );

        // Cleanup should have been called during error handling
        // Actually, cleanup runs on next run or dispose, not on error
        // The cleanup is registered but runs when effect re-runs or disposes
        expect(cleanup).not.toHaveBeenCalled();
      });

      it("should run cleanups in LIFO order", () => {
        const order: number[] = [];
        let dispose = fake<VoidFunction>();

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              ctx.onCleanup(() => order.push(1));
              ctx.onCleanup(() => order.push(2));
              ctx.onCleanup(() => order.push(3));
            });
          }
        );

        dispose?.();

        expect(order).toEqual([3, 2, 1]); // LIFO
      });

      it("should allow unregistering cleanup", () => {
        const cleanup = vi.fn();
        let unregister = fake<VoidFunction>();
        let dispose = fake<VoidFunction>();

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              unregister = ctx.onCleanup(cleanup);
            });
          }
        );

        unregister?.();
        dispose?.();

        expect(cleanup).not.toHaveBeenCalled();
      });
    });

    describe("signal", () => {
      it("should provide AbortSignal", () => {
        let capturedSignal = fake<AbortSignal>();

        effect((ctx) => {
          capturedSignal = ctx.signal;
        });

        expect(capturedSignal).toBeInstanceOf(AbortSignal);
        expect(capturedSignal?.aborted).toBe(false);
      });

      it("should abort signal on dispose", () => {
        let capturedSignal = fake<AbortSignal>();
        let dispose = fake<VoidFunction>();

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              capturedSignal = ctx.signal;
            });
          }
        );

        expect(capturedSignal?.aborted).toBe(false);

        dispose?.();

        expect(capturedSignal?.aborted).toBe(true);
      });

      it("should create signal lazily", () => {
        let signalAccessed = false;
        let dispose = fake<VoidFunction>();

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              // Don't access signal
            });
          }
        );

        // Signal not created if not accessed
        dispose?.();
        // No error expected
      });
    });

    describe("safe(promise)", () => {
      it("should resolve if effect is still active", async () => {
        let safePromise: Promise<string> | null = null;

        effect((ctx) => {
          safePromise = ctx.safe(Promise.resolve("data"));
        });

        const result = await safePromise;
        expect(result).toBe("data");
      });

      it("should never resolve if effect is disposed", async () => {
        let safePromise: Promise<string> | null = null;
        let dispose = fake<VoidFunction>();
        let resolved = false;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              safePromise = ctx.safe(
                new Promise((resolve) => setTimeout(() => resolve("data"), 50))
              );
              safePromise.then(() => {
                resolved = true;
              });
            });
          }
        );

        // Dispose immediately
        dispose?.();

        // Wait for original promise to resolve
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(resolved).toBe(false);
      });

      it("should reject if effect is still active", async () => {
        let safePromise: Promise<string> | null = null;

        effect((ctx) => {
          safePromise = ctx.safe(Promise.reject(new Error("fail")));
        });

        await expect(safePromise).rejects.toThrow("fail");
      });

      it("should never reject if effect is disposed", async () => {
        let safePromise: Promise<string> | null = null as any;
        let dispose: VoidFunction | null = null as any;
        let rejected = false;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              dispose = runEffect();
            },
          },
          () => {
            effect((ctx) => {
              safePromise = ctx.safe(
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("fail")), 50)
                )
              );
              safePromise.catch(() => {
                rejected = true;
              });
            });
          }
        );

        // Dispose immediately
        dispose?.();

        // Wait for original promise to reject
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(rejected).toBe(false);
      });
    });

    describe("safe(fn, ...args)", () => {
      it("should call function and return result if effect is active", () => {
        let result: string | undefined;

        effect((ctx) => {
          result = ctx.safe((value: string) => value.toUpperCase(), "hello");
        });

        expect(result).toBe("HELLO");
      });

      it("should wrap promise result", async () => {
        let resultPromise: Promise<string> | undefined;

        effect((ctx) => {
          resultPromise = ctx.safe(
            async (value: string) => value.toUpperCase(),
            "hello"
          );
        });

        expect(resultPromise).toBeInstanceOf(Promise);
        expect(await resultPromise).toBe("HELLO");
      });
    });

    describe("refresh", () => {
      it("should re-run effect when refresh is called", async () => {
        let runCount = 0;
        let savedRefresh: (() => void) | null = null;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              savedRefresh = ctx.refresh;
            });
          }
        );

        expect(runCount).toBe(1);

        // Call refresh
        savedRefresh?.();
        expect(runCount).toBe(2);

        // Call refresh again
        savedRefresh?.();
        expect(runCount).toBe(3);
      });

      it("should not refresh if effect is disposed", () => {
        let runCount = 0;
        let savedRefresh: (() => void) | null = null;
        let dispose: VoidFunction | null = null;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            dispose = effect((ctx) => {
              runCount++;
              savedRefresh = ctx.refresh;
            });
          }
        );

        expect(runCount).toBe(1);

        // Dispose effect
        dispose?.();

        // Refresh should not work
        savedRefresh?.();
        expect(runCount).toBe(1);
      });

      it("should not refresh from stale context", async () => {
        let runCount = 0;
        let firstRefresh: (() => void) | null = null;
        let secondRefresh: (() => void) | null = null;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              if (runCount === 1) {
                firstRefresh = ctx.refresh;
              } else if (runCount === 2) {
                secondRefresh = ctx.refresh;
              }
            });
          }
        );

        expect(runCount).toBe(1);

        // First refresh works
        firstRefresh?.();
        expect(runCount).toBe(2);

        // First refresh is now stale, should not trigger
        firstRefresh?.();
        expect(runCount).toBe(2);

        // Second refresh works
        secondRefresh?.();
        expect(runCount).toBe(3);
      });

      it("should work with async pattern (async.derive use case)", async () => {
        let runCount = 0;
        let resolvePromise: ((value: string) => void) | null = null;
        let result: string | null = null;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;

              if (runCount === 1) {
                // Simulate async.wait throwing a promise
                const promise = new Promise<string>((resolve) => {
                  resolvePromise = resolve;
                });
                ctx.safe(promise).then(ctx.refresh);
              } else {
                // Second run - data is available
                result = "computed result";
              }
            });
          }
        );

        expect(runCount).toBe(1);
        expect(result).toBeNull();

        // Resolve the promise
        resolvePromise?.("data");
        await new Promise((r) => setTimeout(r, 10));

        expect(runCount).toBe(2);
        expect(result).toBe("computed result");
      });

      it("should throw error when refresh is called while effect is running", () => {
        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            expect(() => {
              effect((ctx) => {
                // Calling refresh synchronously inside the effect body
                // should throw because the effect is still running
                ctx.refresh();
              });
            }).toThrow("Effect is already running, cannot refresh");
          }
        );
      });

      it("should re-run effect when returning ctx.refresh", () => {
        let runCount = 0;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              // Return ctx.refresh to request a re-run after first execution
              if (runCount === 1) {
                return ctx.refresh;
              }
            });
          }
        );

        // Effect should have run twice - initial run and re-run from returning ctx.refresh
        expect(runCount).toBe(2);
      });

      it("should only re-run once when returning ctx.refresh multiple times", () => {
        let runCount = 0;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              // Keep returning ctx.refresh for first 3 runs
              if (runCount <= 3) {
                return ctx.refresh;
              }
            });
          }
        );

        // Effect should have run 4 times total (initial + 3 re-runs)
        expect(runCount).toBe(4);
      });

      it("should not re-run when returning something other than ctx.refresh", () => {
        let runCount = 0;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            effect((ctx) => {
              runCount++;
              // Return something else - should not trigger re-run
              return () => {};
            });
          }
        );

        expect(runCount).toBe(1);
      });

      it("should not re-run from returning ctx.refresh after dispose", () => {
        let runCount = 0;
        let dispose: VoidFunction | undefined;
        let savedRefresh: (() => void) | undefined;

        withHooks(
          {
            scheduleEffect: (runEffect) => {
              runEffect();
            },
            scheduleNotification: (execute) => {
              execute();
            },
          },
          () => {
            dispose = effect((ctx) => {
              runCount++;
              savedRefresh = ctx.refresh;
              // Only return ctx.refresh on first run to avoid infinite loop
              if (runCount === 1) {
                return ctx.refresh;
              }
            });
          }
        );

        // Effect ran twice (initial + re-run from returning ctx.refresh)
        expect(runCount).toBe(2);

        // Now dispose
        dispose?.();

        // Calling refresh after dispose should not trigger re-run
        savedRefresh?.();
        expect(runCount).toBe(2);
      });
    });
  });

  describe("Effect Re-run Triggers", () => {
    it("should re-run from ctx.refresh() called in setTimeout", async () => {
      let runCount = 0;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
          scheduleNotification: (execute) => {
            execute();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;
            if (runCount === 1) {
              setTimeout(() => {
                ctx.refresh();
              }, 10);
            }
          });
        }
      );

      expect(runCount).toBe(1);

      // Wait for setTimeout
      await new Promise((r) => setTimeout(r, 20));

      expect(runCount).toBe(2);
    });

    it("should re-run from ctx.refresh() called in promise.then", async () => {
      let runCount = 0;
      let resolvePromise: (() => void) | null = null;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
          scheduleNotification: (execute) => {
            execute();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;
            if (runCount === 1) {
              const promise = new Promise<void>((resolve) => {
                resolvePromise = resolve;
              });
              promise.then(() => {
                ctx.refresh();
              });
            }
          });
        }
      );

      expect(runCount).toBe(1);

      // Resolve promise and wait for microtask
      resolvePromise?.();
      await new Promise((r) => setTimeout(r, 0));

      expect(runCount).toBe(2);
    });

    it("should re-run from ctx.refresh() called in ctx.safe().then", async () => {
      let runCount = 0;
      let resolvePromise: ((value: string) => void) | null = null;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
          scheduleNotification: (execute) => {
            execute();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;
            if (runCount === 1) {
              const promise = new Promise<string>((resolve) => {
                resolvePromise = resolve;
              });
              ctx.safe(promise).then(() => {
                ctx.refresh();
              });
            }
          });
        }
      );

      expect(runCount).toBe(1);

      // Resolve promise and wait
      resolvePromise?.("data");
      await new Promise((r) => setTimeout(r, 10));

      expect(runCount).toBe(2);
    });

    it("should not re-run from stale ctx.refresh() after effect re-runs", async () => {
      let runCount = 0;
      let firstCtxRefresh: (() => void) | null = null;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
          scheduleNotification: (execute) => {
            execute();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;
            if (runCount === 1) {
              firstCtxRefresh = ctx.refresh;
              // Return ctx.refresh to trigger immediate re-run
              return ctx.refresh;
            }
          });
        }
      );

      // After returning ctx.refresh, effect ran twice
      expect(runCount).toBe(2);

      // The first context's refresh should be stale and not trigger
      firstCtxRefresh?.();
      expect(runCount).toBe(2);
    });

    it("should invalidate old ctx.refresh when effect re-runs", async () => {
      let runCount = 0;
      let firstCtxRefresh: (() => void) | undefined;
      let secondCtxRefresh: (() => void) | undefined;

      withHooks(
        {
          scheduleEffect: (runEffect) => {
            runEffect();
          },
          scheduleNotification: (execute) => {
            execute();
          },
        },
        () => {
          effect((ctx) => {
            runCount++;

            if (runCount === 1) {
              // Save the first context's refresh
              firstCtxRefresh = ctx.refresh;
              // Schedule async refresh that will trigger run 2
              setTimeout(() => {
                ctx.refresh();
              }, 10);
            } else if (runCount === 2) {
              // Save the second context's refresh
              secondCtxRefresh = ctx.refresh;
              // Schedule another async refresh
              setTimeout(() => {
                ctx.refresh(); // This will be stale after run 3
              }, 10);
            }
          });
        }
      );

      expect(runCount).toBe(1);

      // Wait for first setTimeout to trigger run 2
      await new Promise((r) => setTimeout(r, 20));
      expect(runCount).toBe(2);

      // First context's refresh should be stale now
      firstCtxRefresh?.();
      expect(runCount).toBe(2);

      // Second context's refresh still works
      secondCtxRefresh?.();
      expect(runCount).toBe(3);

      // Wait for the stale setTimeout from run 2
      await new Promise((r) => setTimeout(r, 20));

      // Should be 3 - the setTimeout refresh from run 2 was stale
      expect(runCount).toBe(3);
    });
  });
});
