import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "../core/container";
import {
  pingService,
  onlineService,
  networkStore,
  networkService,
} from "./index";
import { abortable } from "../async";

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
    it("should initialize with online status from service", () => {
      // Override onlineService to control initial state
      mockContainer.set(onlineService, () => ({
        isOnline: () => true,
        subscribe: () => () => {},
      }));

      const instance = mockContainer.get(networkStore);
      expect(instance.state.online).toBe(true);
    });

    it("should sync online state from service", async () => {
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
      // Wait for service to update and store to sync
      await new Promise((r) => setTimeout(r, 10));
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
  });

  describe("networkService", () => {
    describe("isOnline()", () => {
      it("should return current online status", () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const network = mockContainer.get(networkService);
        expect(network.isOnline()).toBe(true);
      });
    });

    describe("waitForOnline()", () => {
      it("should resolve immediately if already online", async () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const network = mockContainer.get(networkService);
        const start = Date.now();
        await network.waitForOnline();
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

        const network = mockContainer.get(networkService);
        expect(network.isOnline()).toBe(false);

        let resolved = false;
        const promise = network.waitForOnline().then(() => {
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

        const network = mockContainer.get(networkService);

        // Multiple waiters
        const promise1 = network.waitForOnline();
        const promise2 = network.waitForOnline();

        // Should be the same promise
        expect(promise1).toBe(promise2);

        // Resolve
        capturedListener!(true);
        await Promise.all([promise1, promise2]);
      });
    });

    describe("offlineRetry()", () => {
      it("should execute successfully when online", async () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const network = mockContainer.get(networkService);
        const handler = vi.fn().mockResolvedValue("result");

        const fn = abortable(async () => handler()).use(network.offlineRetry());
        const result = await fn();

        expect(result).toBe("result");
        expect(handler).toHaveBeenCalledTimes(1);
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

        const network = mockContainer.get(networkService);

        // Simulate network error on first call, success on retry
        const networkError = new TypeError("Failed to fetch");
        let callCount = 0;
        const handler = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(networkError);
          }
          return Promise.resolve("success-after-retry");
        });

        const fn = abortable(async () => handler()).use(network.offlineRetry());
        const promise = fn();

        // Wait a bit, should not resolve yet
        await new Promise((r) => setTimeout(r, 10));
        expect(handler).toHaveBeenCalledTimes(1);

        // Simulate coming back online
        capturedListener!(true);
        await new Promise((r) => setTimeout(r, 10));

        const result = await promise;
        expect(result).toBe("success-after-retry");
        expect(handler).toHaveBeenCalledTimes(2);
      });

      it("should throw non-network errors immediately", async () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const network = mockContainer.get(networkService);
        const error = new Error("Some other error");

        const fn = abortable(async () => {
          throw error;
        }).use(network.offlineRetry());

        await expect(fn()).rejects.toThrow("Some other error");
      });

      it("should throw network error if already online", async () => {
        mockContainer.set(onlineService, () => ({
          isOnline: () => true,
          subscribe: () => () => {},
        }));

        const network = mockContainer.get(networkService);
        const error = new TypeError("Failed to fetch");

        const fn = abortable(async () => {
          throw error;
        }).use(network.offlineRetry());

        // Should throw because we're online (no retry needed)
        await expect(fn()).rejects.toThrow("Failed to fetch");
      });
    });
  });
});
