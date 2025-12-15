/**
 * Tests for pick() - fine-grained value tracking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pick } from "./pick";
import { store } from "./store";
import { container } from "./container";
import { effect } from "./effect";
import { withHooks } from "./tracking";

describe("pick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("should throw when called outside of hook context", () => {
      expect(() => {
        pick(() => "test");
      }).toThrow("pick() must be called inside an effect or useStore selector");
    });

    it("should not throw when called inside effect", () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(() => {
        effect(() => {
          const name = pick(() => instance.state.profile.name);
          expect(name).toBe("Alice");
        });
      }).not.toThrow();
    });

    it("should not throw when called inside withHooks with onRead", () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(() => {
        withHooks({ onRead: vi.fn() }, () => {
          const name = pick(() => instance.state.profile.name);
          expect(name).toBe("Alice");
        });
      }).not.toThrow();
    });
  });

  describe("value computation", () => {
    it("should return the computed value", () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      let result: string | undefined;
      withHooks({ onRead: vi.fn() }, () => {
        result = pick(() => instance.state.profile.name);
      });

      expect(result).toBe("Alice");
    });

    it("should support computed values from multiple properties", () => {
      const userStore = store({
        state: { firstName: "Alice", lastName: "Smith" },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      let result: string | undefined;
      withHooks({ onRead: vi.fn() }, () => {
        result = pick(
          () => `${instance.state.firstName} ${instance.state.lastName}`
        );
      });

      expect(result).toBe("Alice Smith");
    });
  });

  describe("dependency tracking", () => {
    it("should create a virtual dependency for parent", () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const onRead = vi.fn();
      withHooks({ onRead }, () => {
        pick(() => instance.state.profile.name);
      });

      // Should have called parent's onRead with a pick: key
      expect(onRead).toHaveBeenCalledTimes(1);
      expect(onRead.mock.calls[0][0].key).toMatch(/^pick:/);
    });

    it("should provide subscribe function in the event", () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup() {
          return {};
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      let subscribeFunction: ((listener: VoidFunction) => VoidFunction) | undefined;
      withHooks(
        {
          onRead: (event) => {
            subscribeFunction = event.subscribe;
          },
        },
        () => {
          pick(() => instance.state.profile.name);
        }
      );

      expect(subscribeFunction).toBeDefined();
      expect(typeof subscribeFunction).toBe("function");
    });
  });

  describe("fine-grained reactivity", () => {
    it("should only trigger when picked value changes", async () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup({ state }) {
          return {
            setName(name: string) {
              state.profile = { ...state.profile, name };
            },
            setAge(age: number) {
              state.profile = { ...state.profile, age };
            },
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const effectFn = vi.fn();
      effect(() => {
        const name = pick(() => instance.state.profile.name);
        effectFn(name);
      });

      expect(effectFn).toHaveBeenCalledTimes(1);
      expect(effectFn).toHaveBeenLastCalledWith("Alice");

      // Change age - should NOT trigger
      instance.actions.setAge(31);
      // Give time for any async effects
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(1); // Still 1

      // Change name - should trigger
      instance.actions.setName("Bob");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(2);
      expect(effectFn).toHaveBeenLastCalledWith("Bob");
    });

    it("should work with nested property access", async () => {
      const appStore = store({
        state: {
          user: {
            profile: {
              address: {
                city: "NYC",
                zip: "10001",
              },
            },
          },
        },
        setup({ state }) {
          return {
            setCity(city: string) {
              state.user = {
                ...state.user,
                profile: {
                  ...state.user.profile,
                  address: { ...state.user.profile.address, city },
                },
              };
            },
            setZip(zip: string) {
              state.user = {
                ...state.user,
                profile: {
                  ...state.user.profile,
                  address: { ...state.user.profile.address, zip },
                },
              };
            },
          };
        },
      });

      const stores = container();
      const instance = stores.get(appStore);

      const effectFn = vi.fn();
      effect(() => {
        const city = pick(() => instance.state.user.profile.address.city);
        effectFn(city);
      });

      expect(effectFn).toHaveBeenCalledTimes(1);
      expect(effectFn).toHaveBeenLastCalledWith("NYC");

      // Change zip - should NOT trigger
      instance.actions.setZip("10002");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(1);

      // Change city - should trigger
      instance.actions.setCity("LA");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(2);
      expect(effectFn).toHaveBeenLastCalledWith("LA");
    });
  });

  describe("dynamic dependencies", () => {
    it("should re-track dependencies when they change", async () => {
      const appStore = store({
        state: {
          useAlt: false,
          profile: { name: "Alice" },
          altProfile: { name: "Bob" },
        },
        setup({ state }) {
          return {
            toggleAlt() {
              state.useAlt = !state.useAlt;
            },
            setName(name: string) {
              state.profile = { name };
            },
            setAltName(name: string) {
              state.altProfile = { name };
            },
          };
        },
      });

      const stores = container();
      const instance = stores.get(appStore);

      const effectFn = vi.fn();
      effect(() => {
        const name = pick(() =>
          instance.state.useAlt
            ? instance.state.altProfile.name
            : instance.state.profile.name
        );
        effectFn(name);
      });

      expect(effectFn).toHaveBeenCalledTimes(1);
      expect(effectFn).toHaveBeenLastCalledWith("Alice");

      // Change altProfile - should NOT trigger (not currently tracked)
      instance.actions.setAltName("Charlie");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(1);

      // Toggle to alt mode - should trigger and switch to altProfile
      instance.actions.toggleAlt();
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(2);
      expect(effectFn).toHaveBeenLastCalledWith("Charlie");

      // Now change profile - should NOT trigger (no longer tracked)
      instance.actions.setName("Diana");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(2);

      // Change altProfile - should trigger (now tracked)
      instance.actions.setAltName("Eve");
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(3);
      expect(effectFn).toHaveBeenLastCalledWith("Eve");
    });
  });

  describe("custom equality", () => {
    it("should use custom equality function", async () => {
      const userStore = store({
        state: { profile: { name: "Alice", age: 30 } },
        setup({ state }) {
          return {
            setProfile(profile: { name: string; age: number }) {
              state.profile = profile;
            },
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const effectFn = vi.fn();
      effect(() => {
        // Only care about name, not age
        const profile = pick(
          () => instance.state.profile,
          (a, b) => a.name === b.name
        );
        effectFn(profile);
      });

      expect(effectFn).toHaveBeenCalledTimes(1);

      // Change age only - custom equality says it's equal
      instance.actions.setProfile({ name: "Alice", age: 31 });
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(1); // Still 1

      // Change name - should trigger
      instance.actions.setProfile({ name: "Bob", age: 31 });
      await new Promise((r) => setTimeout(r, 10));
      expect(effectFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("non-reactive values", () => {
    it("should handle selectors with no reactive dependencies", () => {
      const onRead = vi.fn();

      withHooks({ onRead }, () => {
        const value = pick(() => 42);
        expect(value).toBe(42);
      });

      // No onRead should be called since there are no dependencies
      expect(onRead).not.toHaveBeenCalled();
    });

    it("should handle selectors with only constants", () => {
      const constant = { name: "test" };
      const onRead = vi.fn();

      withHooks({ onRead }, () => {
        const value = pick(() => constant.name);
        expect(value).toBe("test");
      });

      // No onRead since constant is not reactive
      expect(onRead).not.toHaveBeenCalled();
    });
  });
});

