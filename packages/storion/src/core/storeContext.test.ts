/**
 * Tests for storeContext focus() implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { store } from "./store";
import { container } from "./container";

describe("focus()", () => {
  describe("basic getter/setter tuple", () => {
    it("should return a tuple with getter and setter", () => {
      const userStore = store({
        state: {
          profile: {
            name: "John",
            address: { city: "NYC", zip: "10001" },
          },
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("profile.name");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(typeof instance.actions.get).toBe("function");
      expect(typeof instance.actions.set).toBe("function");
    });

    it("should get the value at the focused path", () => {
      const userStore = store({
        state: {
          profile: { name: "John" },
        },
        setup: (ctx) => {
          const [get] = ctx.focus("profile.name");
          return { get };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.get()).toBe("John");
    });

    it("should set the value at the focused path", () => {
      const userStore = store({
        state: {
          profile: { name: "John" },
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("profile.name");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.set("Jane");
      expect(instance.actions.get()).toBe("Jane");
      expect(instance.state.profile.name).toBe("Jane");
    });

    it("should support reducer function in setter", () => {
      const userStore = store({
        state: {
          count: 5,
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("count");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.set((prev: number) => prev + 10);
      expect(instance.actions.get()).toBe(15);
    });

    it("should support immer-style produce in setter (mutate draft, no return)", () => {
      const userStore = store({
        state: {
          profile: { name: "John", age: 30 },
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("profile");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // Produce-style: mutate draft, don't return
      instance.actions.set((draft: { name: string; age: number }) => {
        draft.name = "Jane";
        draft.age = 25;
      });

      expect(instance.actions.get()).toEqual({ name: "Jane", age: 25 });
      expect(instance.state.profile).toEqual({ name: "Jane", age: 25 });
    });

    it("should distinguish between reducer (returns value) and produce (returns undefined)", () => {
      const userStore = store({
        state: {
          items: [1, 2, 3],
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("items");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // Reducer style - returns new array
      instance.actions.set((prev: number[]) => [...prev, 4]);
      expect(instance.actions.get()).toEqual([1, 2, 3, 4]);

      // Produce style - mutates array in place (immer draft)
      instance.actions.set((draft: number[]) => {
        draft.push(5);
      });
      expect(instance.actions.get()).toEqual([1, 2, 3, 4, 5]);
    });

    it("should work with deeply nested paths", () => {
      const userStore = store({
        state: {
          a: { b: { c: { d: "deep" } } },
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("a.b.c.d");
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.get()).toBe("deep");
      instance.actions.set("updated");
      expect(instance.actions.get()).toBe("updated");
    });
  });

  describe("fallback option", () => {
    it("should return fallback value when focused value is null", () => {
      const userStore = store({
        state: {
          profile: null as { name: string } | null,
        },
        setup: (ctx) => {
          const [get] = ctx.focus("profile", {
            fallback: () => ({ name: "default" }),
          });
          return { get };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.get()).toEqual({ name: "default" });
    });

    it("should return fallback value when focused value is undefined", () => {
      const userStore = store({
        state: {
          profile: undefined as { name: string } | undefined,
        },
        setup: (ctx) => {
          const [get] = ctx.focus("profile", {
            fallback: () => ({ name: "fallback" }),
          });
          return { get };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.get()).toEqual({ name: "fallback" });
    });

    it("should return actual value when not nullish", () => {
      const userStore = store({
        state: {
          profile: { name: "John" } as { name: string } | null,
        },
        setup: (ctx) => {
          const [get] = ctx.focus("profile", {
            fallback: () => ({ name: "default" }),
          });
          return { get };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.get()).toEqual({ name: "John" });
    });

    it("should use fallback on setter when value is nullish", () => {
      const userStore = store({
        state: {
          profile: null as { name: string; age: number } | null,
        },
        setup: (ctx) => {
          const [get, set] = ctx.focus("profile", {
            fallback: () => ({ name: "default", age: 0 }),
          });
          return { get, set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // When using reducer with nullish value, should receive fallback
      instance.actions.set((prev) => ({ ...prev, name: "Updated" }));
      expect(instance.actions.get()).toEqual({ name: "Updated", age: 0 });
    });
  });

  describe("on() listener", () => {
    it("should have on method on the focus tuple", () => {
      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          // Return getter/setter as actions, keep focus reference for on()
          const [get, set] = focus;
          return {
            get,
            set,
            subscribe: (
              listener: (event: { next: number; prev: number }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(typeof instance.actions.subscribe).toBe("function");
    });

    it("should call listener when focused value changes", () => {
      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          const [, set] = focus;
          return {
            setValue: (v: number) => {
              ctx.state.value = v;
            },
            subscribe: (
              listener: (event: { next: number; prev: number }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.subscribe(listener);

      instance.actions.setValue(2);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ next: 2, prev: 1 });
    });

    it("should not call listener when value does not change", () => {
      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          return {
            setValue: (v: number) => {
              ctx.state.value = v;
            },
            subscribe: (
              listener: (event: { next: number; prev: number }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.subscribe(listener);

      instance.actions.setValue(1); // Same value

      expect(listener).not.toHaveBeenCalled();
    });

    it("should return unsubscribe function", () => {
      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          return {
            setValue: (v: number) => {
              ctx.state.value = v;
            },
            subscribe: (
              listener: (event: { next: number; prev: number }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      const unsubscribe = instance.actions.subscribe(listener);

      instance.actions.setValue(2);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      instance.actions.setValue(3);
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it("should detect changes in nested paths", () => {
      const userStore = store({
        state: {
          profile: { address: { city: "NYC" } },
        },
        setup: (ctx) => {
          const focus = ctx.focus("profile.address.city");
          return {
            setCity: (city: string) => {
              ctx.state.profile = {
                ...ctx.state.profile,
                address: { ...ctx.state.profile.address, city },
              };
            },
            subscribe: (
              listener: (event: { next: string; prev: string }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.subscribe(listener);

      instance.actions.setCity("LA");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ next: "LA", prev: "NYC" });
    });
  });

  describe("equality option", () => {
    it("should use custom equality for change detection", () => {
      const userStore = store({
        state: {
          items: [1, 2, 3],
        },
        setup: (ctx) => {
          const focus = ctx.focus("items", {
            equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
          });
          return {
            setItems: (items: number[]) => {
              ctx.state.items = items;
            },
            subscribe: (
              listener: (event: { next: number[]; prev: number[] }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.subscribe(listener);

      // Set to equivalent array (different reference but same content)
      instance.actions.setItems([1, 2, 3]);

      // Should not trigger listener because arrays are equal by custom equality
      expect(listener).not.toHaveBeenCalled();
    });

    it("should use shorthand equality", () => {
      const userStore = store({
        state: {
          obj: { a: 1, b: 2 },
        },
        setup: (ctx) => {
          const focus = ctx.focus("obj", {
            equality: "shallow",
          });
          return {
            setObj: (obj: { a: number; b: number }) => {
              ctx.state.obj = obj;
            },
            subscribe: (
              listener: (event: {
                next: { a: number; b: number };
                prev: { a: number; b: number };
              }) => void
            ) => focus.on(listener),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.subscribe(listener);

      // Set to equivalent object (different reference but same shallow content)
      instance.actions.setObj({ a: 1, b: 2 });

      // Should not trigger listener because objects are shallow equal
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("focus on root-level properties", () => {
    it("should work with single-segment paths", () => {
      const userStore = store({
        state: {
          name: "John",
          age: 30,
        },
        setup: (ctx) => {
          const [getName, setName] = ctx.focus("name");
          const [getAge, setAge] = ctx.focus("age");
          return { getName, setName, getAge, setAge };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.getName()).toBe("John");
      expect(instance.actions.getAge()).toBe(30);

      instance.actions.setName("Jane");
      instance.actions.setAge(25);

      expect(instance.actions.getName()).toBe("Jane");
      expect(instance.actions.getAge()).toBe(25);
    });
  });

  describe("auto-create intermediate objects", () => {
    it("should auto-create intermediate objects when setting nested path", () => {
      const userStore = store({
        state: {
          data: null as { nested: { value: string } } | null,
        },
        setup: (ctx) => {
          const [, set] = ctx.focus("data");
          return { set };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.set({ nested: { value: "created" } });

      expect(instance.state.data).toEqual({ nested: { value: "created" } });
    });
  });

  describe("error handling", () => {
    it("should throw error when returning non-function actions", () => {
      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          // Incorrectly returning the focus tuple directly
          return { focus } as any;
        },
      });

      const stores = container();

      expect(() => stores.get(userStore)).toThrow(
        /Action "focus" must be a function/
      );
    });

    it("should throw error when focus is called outside setup phase", () => {
      let capturedCtx: any;

      const userStore = store({
        state: { value: 1 },
        setup: (ctx) => {
          capturedCtx = ctx;
          const [get, set] = ctx.focus("value");
          return {
            get,
            set,
            createFocusOutsideSetup: () => {
              // This should throw
              return ctx.focus("value");
            },
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // Calling focus inside an action should throw
      expect(() => instance.actions.createFocusOutsideSetup()).toThrow(
        /createFocus\(\) can only be called during setup phase/
      );

      // Using captured context outside setup should also throw
      expect(() => capturedCtx.focus("value")).toThrow(
        /createFocus\(\) can only be called during setup phase/
      );
    });
  });

  describe("to() method for relative focus", () => {
    it("should create a child focus from parent focus", () => {
      const userStore = store({
        state: {
          user: {
            name: "John",
            address: {
              city: "NYC",
              country: "USA",
            },
          },
        },
        setup: (ctx) => {
          const userFocus = ctx.focus("user");
          const addressFocus = userFocus.to<{ city: string; country: string }>(
            "address"
          );
          const [getCity, setCity] = addressFocus.to<string>("city");

          return { getCity, setCity };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.getCity()).toBe("NYC");

      instance.actions.setCity("LA");
      expect(instance.actions.getCity()).toBe("LA");
      expect(instance.state.user.address.city).toBe("LA");
    });

    it("should support chained to() calls", () => {
      const userStore = store({
        state: {
          data: {
            nested: {
              deep: {
                value: 42,
              },
            },
          },
        },
        setup: (ctx) => {
          const dataFocus = ctx.focus("data");
          const valueFocus = dataFocus
            .to<{ deep: { value: number } }>("nested")
            .to<{ value: number }>("deep")
            .to<number>("value");

          const [getValue, setValue] = valueFocus;
          return { getValue, setValue };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.getValue()).toBe(42);

      instance.actions.setValue(100);
      expect(instance.actions.getValue()).toBe(100);
    });

    it("should support options in to() method", () => {
      const userStore = store({
        state: {
          user: {
            profile: null as { name: string } | null,
          },
        },
        setup: (ctx) => {
          const userFocus = ctx.focus("user");
          const profileFocus = userFocus.to<{ name: string }>("profile", {
            fallback: () => ({ name: "Guest" }),
          });
          const [getProfile] = profileFocus;

          return { getProfile };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // Should return fallback when profile is null
      expect(instance.actions.getProfile()).toEqual({ name: "Guest" });
    });

    it("should have on() method on child focus", () => {
      const userStore = store({
        state: {
          user: {
            name: "John",
          },
        },
        setup: (ctx) => {
          const userFocus = ctx.focus("user");
          const nameFocus = userFocus.to<string>("name");
          const [getName, setName] = nameFocus;

          return {
            getName,
            setName,
            onNameChange: (cb: (e: { next: string; prev: string }) => void) =>
              nameFocus.on(cb),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      const listener = vi.fn();
      instance.actions.onNameChange(listener);

      instance.actions.setName("Jane");

      expect(listener).toHaveBeenCalledWith({
        next: "Jane",
        prev: "John",
      });
    });
  });

  describe("dirty() method", () => {
    it("should return false when value has not changed", () => {
      const userStore = store({
        state: {
          profile: { name: "John" },
        },
        setup: (ctx) => {
          const focus = ctx.focus("profile.name");
          return {
            isDirty: () => focus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.isDirty()).toBe(false);
    });

    it("should return true when value has changed", () => {
      const userStore = store({
        state: {
          profile: { name: "John" },
        },
        setup: (ctx) => {
          const focus = ctx.focus("profile.name");
          const [, setName] = focus;
          return {
            setName,
            isDirty: () => focus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.isDirty()).toBe(false);

      instance.actions.setName("Jane");

      expect(instance.actions.isDirty()).toBe(true);
    });

    it("should return false after setting value back to initial", () => {
      const userStore = store({
        state: {
          count: 10,
        },
        setup: (ctx) => {
          const focus = ctx.focus("count");
          const [, setCount] = focus;
          return {
            setCount,
            isDirty: () => focus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setCount(20);
      expect(instance.actions.isDirty()).toBe(true);

      instance.actions.setCount(10);
      expect(instance.actions.isDirty()).toBe(false);
    });

    it("should use custom equality for dirty check", () => {
      const userStore = store({
        state: {
          items: [1, 2, 3],
        },
        setup: (ctx) => {
          const focus = ctx.focus("items", {
            equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
          });
          const [, setItems] = focus;
          return {
            setItems,
            isDirty: () => focus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      // Set to equivalent array (different reference but same content)
      instance.actions.setItems([1, 2, 3]);
      expect(instance.actions.isDirty()).toBe(false);

      // Set to different array
      instance.actions.setItems([1, 2, 3, 4]);
      expect(instance.actions.isDirty()).toBe(true);
    });

    it("should work with nested paths", () => {
      const userStore = store({
        state: {
          user: {
            profile: {
              address: {
                city: "NYC",
              },
            },
          },
        },
        setup: (ctx) => {
          const focus = ctx.focus("user.profile.address.city");
          const [, setCity] = focus;
          return {
            setCity,
            isDirty: () => focus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      expect(instance.actions.isDirty()).toBe(false);

      instance.actions.setCity("LA");
      expect(instance.actions.isDirty()).toBe(true);
    });
  });

  describe("reset() method", () => {
    it("should reset value to initial state", () => {
      const userStore = store({
        state: {
          profile: { name: "John" },
        },
        setup: (ctx) => {
          const focus = ctx.focus("profile.name");
          const [getName, setName] = focus;
          return {
            getName,
            setName,
            reset: () => focus.reset(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setName("Jane");
      expect(instance.actions.getName()).toBe("Jane");

      instance.actions.reset();
      expect(instance.actions.getName()).toBe("John");
    });

    it("should make dirty() return false after reset", () => {
      const userStore = store({
        state: {
          count: 5,
        },
        setup: (ctx) => {
          const focus = ctx.focus("count");
          const [getCount, setCount] = focus;
          return {
            getCount,
            setCount,
            isDirty: () => focus.dirty(),
            reset: () => focus.reset(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setCount(100);
      expect(instance.actions.isDirty()).toBe(true);

      instance.actions.reset();
      expect(instance.actions.isDirty()).toBe(false);
      expect(instance.actions.getCount()).toBe(5);
    });

    it("should work with nested paths", () => {
      const userStore = store({
        state: {
          user: {
            address: {
              city: "NYC",
              zip: "10001",
            },
          },
        },
        setup: (ctx) => {
          const cityFocus = ctx.focus("user.address.city");
          const [getCity, setCity] = cityFocus;
          return {
            getCity,
            setCity,
            resetCity: () => cityFocus.reset(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setCity("LA");
      expect(instance.actions.getCity()).toBe("LA");

      instance.actions.resetCity();
      expect(instance.actions.getCity()).toBe("NYC");
      // Other fields should not be affected
      expect(instance.state.user.address.zip).toBe("10001");
    });

    it("should work with object values", () => {
      const userStore = store({
        state: {
          config: {
            settings: { theme: "light", fontSize: 14 },
          },
        },
        setup: (ctx) => {
          const focus = ctx.focus("config.settings");
          const [getSettings, setSettings] = focus;
          return {
            getSettings,
            setSettings,
            reset: () => focus.reset(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setSettings({ theme: "dark", fontSize: 18 });
      expect(instance.actions.getSettings()).toEqual({
        theme: "dark",
        fontSize: 18,
      });

      instance.actions.reset();
      expect(instance.actions.getSettings()).toEqual({
        theme: "light",
        fontSize: 14,
      });
    });

    it("should trigger on() listener when resetting", () => {
      const userStore = store({
        state: {
          value: "initial",
        },
        setup: (ctx) => {
          const focus = ctx.focus("value");
          const [, setValue] = focus;
          return {
            setValue,
            reset: () => focus.reset(),
            onValueChange: (
              cb: (e: { next: string; prev: string }) => void
            ) => focus.on(cb),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setValue("changed");

      const listener = vi.fn();
      instance.actions.onValueChange(listener);

      instance.actions.reset();

      expect(listener).toHaveBeenCalledWith({
        next: "initial",
        prev: "changed",
      });
    });

    it("should work with child focus via to()", () => {
      const userStore = store({
        state: {
          user: {
            profile: {
              name: "John",
              age: 25,
            },
          },
        },
        setup: (ctx) => {
          const userFocus = ctx.focus("user");
          const nameFocus = userFocus.to<string>("profile.name");
          const [getName, setName] = nameFocus;

          return {
            getName,
            setName,
            resetName: () => nameFocus.reset(),
            isNameDirty: () => nameFocus.dirty(),
          };
        },
      });

      const stores = container();
      const instance = stores.get(userStore);

      instance.actions.setName("Jane");
      expect(instance.actions.getName()).toBe("Jane");
      expect(instance.actions.isNameDirty()).toBe(true);

      instance.actions.resetName();
      expect(instance.actions.getName()).toBe("John");
      expect(instance.actions.isNameDirty()).toBe(false);
    });
  });
});

describe("onDispose()", () => {
  it("should register cleanup callback that runs on dispose", () => {
    const cleanup = vi.fn();

    const testStore = store({
      state: { value: 0 },
      setup: (ctx) => {
        ctx.onDispose(cleanup);
        return {};
      },
    });

    const stores = container();
    const instance = stores.get(testStore);

    expect(cleanup).not.toHaveBeenCalled();

    instance.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should call multiple cleanup callbacks in registration order", () => {
    const order: number[] = [];

    const testStore = store({
      state: { value: 0 },
      setup: (ctx) => {
        ctx.onDispose(() => order.push(1));
        ctx.onDispose(() => order.push(2));
        ctx.onDispose(() => order.push(3));
        return {};
      },
    });

    const stores = container();
    const instance = stores.get(testStore);

    instance.dispose();

    expect(order).toEqual([1, 2, 3]);
  });

  it("should allow cleanup of subscriptions", () => {
    const unsubscribe = vi.fn();
    const mockApi = {
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const testStore = store({
      state: { data: null as string | null },
      setup: (ctx) => {
        const unsub = mockApi.subscribe((data: string) => {
          ctx.state.data = data;
        });
        ctx.onDispose(unsub);
        return {};
      },
    });

    const stores = container();
    const instance = stores.get(testStore);

    expect(mockApi.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    instance.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should allow cleanup of intervals/timers", () => {
    vi.useFakeTimers();

    const tickFn = vi.fn();

    const testStore = store({
      state: { tick: 0 },
      setup: (ctx) => {
        const intervalId = setInterval(() => {
          ctx.state.tick++;
          tickFn();
        }, 100);
        ctx.onDispose(() => clearInterval(intervalId));
        return {};
      },
    });

    const stores = container();
    const instance = stores.get(testStore);

    // Advance time - interval should fire
    vi.advanceTimersByTime(350);
    expect(tickFn).toHaveBeenCalledTimes(3);

    // Dispose should clear interval
    instance.dispose();

    // Advance more time - interval should NOT fire
    vi.advanceTimersByTime(500);
    expect(tickFn).toHaveBeenCalledTimes(3); // Still 3

    vi.useRealTimers();
  });
});
