import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "../core/container";
import {
  pingService,
  onlineService,
  networkStore,
  networkRetryService,
} from "./index";

describe("network", () => {
  let mockContainer: ReturnType<typeof container>;

  beforeEach(() => {
    mockContainer = container();
  });

  afterEach(() => {
    mockContainer.dispose();
  });

  describe("pingService", () => {
    it("should return true by default (optimistic)", async () => {
      const ping = mockContainer.get(pingService);
      const result = await ping.ping();
      expect(result).toBe(true);
    });

    it("should delay before returning", async () => {
      const ping = mockContainer.get(pingService);
      const start = Date.now();
      await ping.ping();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(250); // ~300ms with some tolerance
    });

    it("should allow override for custom ping logic", async () => {
      mockContainer.set(pingService, () => ({
        ping: async () => false,
      }));

      const ping = mockContainer.get(pingService);
      const result = await ping.ping();
      expect(result).toBe(false);
    });
  });

  describe("onlineService", () => {
    it("should return isOnline status", () => {
      const online = mockContainer.get(onlineService);
      // In test environment, navigator may not exist
      const result = online.isOnline();
      expect(typeof result).toBe("boolean");
    });

    it("should allow subscribe/unsubscribe", () => {
      const online = mockContainer.get(onlineService);
      const listener = vi.fn();
      const unsubscribe = online.subscribe(listener);
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should allow override for custom online detection", () => {
      const mockListener = vi.fn();
      let capturedListener: ((online: boolean) => void) | null = null;

      mockContainer.set(onlineService, () => ({
        isOnline: () => false,
        subscribe: (listener) => {
          capturedListener = listener;
          return () => {
            capturedListener = null;
          };
        },
      }));

      const online = mockContainer.get(onlineService);
      expect(online.isOnline()).toBe(false);

      online.subscribe(mockListener);
      expect(capturedListener).not.toBeNull();

      // Simulate online event
      capturedListener!(true);
      expect(mockListener).toHaveBeenCalledWith(true);
    });
  });

  describe("networkStore", () => {
    it("should initialize with online status", () => {
      // Override onlineService to control initial state
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const instance = mockContainer.get(networkStore);
      expect(instance.state.online).toBe(true);
    });

    it("should update online state when event fires", async () => {
      let capturedListener: ((online: boolean) => void) | null = null;

      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: (listener) => {
          capturedListener = listener;
          return () => {
            capturedListener = null;
          };
        },
      }));

      // Override ping to be instant
      mockContainer.set(pingService, () => ({
        ping: async () => true,
      }));

      const instance = mockContainer.get(networkStore);
      expect(instance.state.online).toBe(true);

      // Simulate offline
      capturedListener!(false);
      expect(instance.state.online).toBe(false);

      // Simulate online
      capturedListener!(true);
      // Wait for ping
      await new Promise((r) => setTimeout(r, 10));
      expect(instance.state.online).toBe(true);
    });

    it("should use ping result when browser says online", async () => {
      let capturedListener: ((online: boolean) => void) | null = null;

      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: (listener) => {
          capturedListener = listener;
          return () => {};
        },
      }));

      // Ping returns false (e.g., captive portal)
      mockContainer.set(pingService, () => ({
        ping: async () => false,
      }));

      const instance = mockContainer.get(networkStore);

      // Simulate browser online event
      capturedListener!(true);
      await new Promise((r) => setTimeout(r, 10));

      // Should be offline because ping failed
      expect(instance.state.online).toBe(false);
    });

    describe("waitForOnline", () => {
      it("should resolve immediately if already online", async () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const instance = mockContainer.get(networkStore);
        const start = Date.now();
        await instance.actions.waitForOnline();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50);
      });

      it("should wait until online", async () => {
        let capturedListener: ((online: boolean) => void) | null = null;

        mockContainer.set(onlineService, () => ({
          isOnline: () => false,
          subscribe: (listener) => {
            capturedListener = listener;
            return () => {};
          },
        }));

        mockContainer.set(pingService, () => ({
          ping: async () => true,
        }));

        const instance = mockContainer.get(networkStore);
        expect(instance.state.online).toBe(false);

        let resolved = false;
        const promise = instance.actions.waitForOnline().then(() => {
          resolved = true;
        });

        // Should not be resolved yet
        await new Promise((r) => setTimeout(r, 10));
        expect(resolved).toBe(false);

        // Simulate online
        capturedListener!(true);
        await new Promise((r) => setTimeout(r, 10));

        await promise;
        expect(resolved).toBe(true);
      });

      it("should share promise between multiple waiters", async () => {
        let capturedListener: ((online: boolean) => void) | null = null;

        mockContainer.set(onlineService, () => ({
          isOnline: () => false,
          subscribe: (listener) => {
            capturedListener = listener;
            return () => {};
          },
        }));

        mockContainer.set(pingService, () => ({
          ping: async () => true,
        }));

        const instance = mockContainer.get(networkStore);

        // Multiple waiters
        const promise1 = instance.actions.waitForOnline();
        const promise2 = instance.actions.waitForOnline();

        // Should be the same promise
        expect(promise1).toBe(promise2);

        // Resolve
        capturedListener!(true);
        await Promise.all([promise1, promise2]);
      });
    });
  });

  describe("networkRetryService", () => {
    it("should wrap single function and call successfully", async () => {
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const retry = mockContainer.get(networkRetryService);
      const fn = vi.fn().mockResolvedValue("result");

      const wrapped = retry.wrap(fn);
      const result = await wrapped("arg1", "arg2");

      expect(result).toBe("result");
      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should wrap map of functions", async () => {
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const retry = mockContainer.get(networkRetryService);
      const api = retry.wrap({
        getUser: vi.fn().mockResolvedValue({ id: 1 }),
        getPosts: vi.fn().mockResolvedValue([]),
      });

      const user = await api.getUser("123");
      const posts = await api.getPosts();

      expect(user).toEqual({ id: 1 });
      expect(posts).toEqual([]);
    });

    it("should call function directly with call()", async () => {
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const retry = mockContainer.get(networkRetryService);
      const fn = vi.fn().mockResolvedValue("direct-result");

      const result = await retry.call(fn, "a", "b");

      expect(result).toBe("direct-result");
      expect(fn).toHaveBeenCalledWith("a", "b");
    });

    it("should retry on network error when offline", async () => {
      let capturedListener: ((online: boolean) => void) | null = null;

      mockContainer.set(onlineService, () => ({
        isOnline: () => false,
        subscribe: (listener) => {
          capturedListener = listener;
          return () => {};
        },
      }));

      mockContainer.set(pingService, () => ({
        ping: async () => true,
      }));

      const retry = mockContainer.get(networkRetryService);

      // Simulate network error
      const networkError = new TypeError("Failed to fetch");
      let callCount = 0;
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(networkError);
        }
        return Promise.resolve("success-after-retry");
      });

      const wrapped = retry.wrap(fn);
      const promise = wrapped();

      // Wait a bit, should not resolve yet
      await new Promise((r) => setTimeout(r, 10));
      expect(fn).toHaveBeenCalledTimes(1);

      // Simulate coming back online
      capturedListener!(true);
      await new Promise((r) => setTimeout(r, 10));

      const result = await promise;
      expect(result).toBe("success-after-retry");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should throw non-network errors immediately", async () => {
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const retry = mockContainer.get(networkRetryService);
      const error = new Error("Some other error");
      const fn = vi.fn().mockRejectedValue(error);

      const wrapped = retry.wrap(fn);

      await expect(wrapped()).rejects.toThrow("Some other error");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should throw network error if already online", async () => {
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const retry = mockContainer.get(networkRetryService);
      const error = new TypeError("Failed to fetch");
      const fn = vi.fn().mockRejectedValue(error);

      const wrapped = retry.wrap(fn);

      // Should throw because we're online (no retry needed)
      await expect(wrapped()).rejects.toThrow("Failed to fetch");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

