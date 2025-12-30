/**
 * Tests for mixins composition.
 */

import { describe, it, expect } from "vitest";
import { mixins } from "./mixins";
import { store } from "./store";
import { container } from "./container";
import { SelectorContext } from "../types";
import { isSpec } from "../is";

describe("mixins", () => {
  describe("store spec overload", () => {
    it("should return proxy for accessing state properties as mixins", () => {
      const counterStore = store({
        name: "counter",
        state: { count: 0, name: "Counter" },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container();
      const proxy = mixins(counterStore);

      // Create a mock selector context
      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // Access state property as mixin
      const countMixin = proxy.count;
      expect(countMixin(mockCtx)).toBe(0);

      const nameMixin = proxy.name;
      expect(nameMixin(mockCtx)).toBe("Counter");
    });

    it("should return proxy for accessing actions as mixins", () => {
      const counterStore = store({
        name: "counter",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
          reset: () => {
            state.count = 0;
          },
        }),
      });

      const app = container();
      const proxy = mixins(counterStore);

      // Create a mock selector context
      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // Access action as mixin
      const incrementMixin = proxy.increment;
      const incrementFn = incrementMixin(mockCtx);
      expect(typeof incrementFn).toBe("function");

      // Call the action
      incrementFn();
      const instance = app.get(counterStore);
      expect(instance.state.count).toBe(1);
    });

    it("should distinguish between state properties and actions", () => {
      const userStore = store({
        name: "user",
        state: { name: "John", age: 30 },
        setup: ({ state }) => ({
          setName: (name: string) => {
            state.name = name;
          },
          setAge: (age: number) => {
            state.age = age;
          },
        }),
      });

      const app = container();
      const proxy = mixins(userStore);

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // State properties should return values
      const nameMixin = proxy.name;
      expect(nameMixin(mockCtx)).toBe("John");

      const ageMixin = proxy.age;
      expect(ageMixin(mockCtx)).toBe(30);

      // Actions should return functions
      const setNameMixin = proxy.setName;
      const setNameFn = setNameMixin(mockCtx);
      expect(typeof setNameFn).toBe("function");

      setNameFn("Jane");
      const instance = app.get(userStore);
      expect(instance.state.name).toBe("Jane");
    });

    it("should work with stores that have no actions", () => {
      const dataStore = store({
        name: "data",
        state: { value: 42 },
      });

      const app = container();
      const proxy = mixins(dataStore);

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      const valueMixin = proxy.value;
      expect(valueMixin(mockCtx)).toBe(42);
    });

    it("should work with stores that have no state", () => {
      const serviceStore = store({
        name: "service",
        state: {},
        setup: () => ({
          doSomething: () => "done",
        }),
      });

      const app = container();
      const proxy = mixins(serviceStore);

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      const doSomethingMixin = proxy.doSomething;
      const doSomethingFn = doSomethingMixin(mockCtx);
      expect(typeof doSomethingFn).toBe("function");
      expect(doSomethingFn()).toBe("done");
    });

    it("should support select() with array syntax", () => {
      const userStore = store({
        name: "user",
        state: { name: "John", age: 30 },
        setup: ({ state }) => ({
          setName: (name: string) => {
            state.name = name;
          },
        }),
      });

      const app = container();
      const proxy = mixins(userStore);

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // Select multiple properties/actions
      const selectedMixin = proxy.select(["name", "age", "setName"]);
      const result = selectedMixin(mockCtx);

      expect(result.name).toBe("John");
      expect(result.age).toBe(30);
      expect(typeof result.setName).toBe("function");

      // Verify mixins are cached and reused
      const nameMixin1 = proxy.name;
      const nameMixin2 = proxy.name;
      expect(nameMixin1).toBe(nameMixin2);
    });

    it("should support select() with object syntax", () => {
      const userStore = store({
        name: "user",
        state: { name: "John", age: 30 },
        setup: ({ state }) => ({
          setName: (name: string) => {
            state.name = name;
          },
          setAge: (age: number) => {
            state.age = age;
          },
        }),
      });

      const app = container();
      const proxy = mixins(userStore);

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // Select with custom key mapping
      const selectedMixin = proxy.select({
        userName: "name",
        userAge: "age",
        updateName: "setName",
        updateAge: "setAge",
      });
      const result = selectedMixin(mockCtx);

      expect(result.userName).toBe("John");
      expect(result.userAge).toBe(30);
      expect(typeof result.updateName).toBe("function");
      expect(typeof result.updateAge).toBe("function");

      // Verify actions work
      result.updateName("Jane");
      result.updateAge(25);
      const instance = app.get(userStore);
      expect(instance.state.name).toBe("Jane");
      expect(instance.state.age).toBe(25);
    });

    it("should cache mixins when accessed via select()", () => {
      const counterStore = store({
        name: "counter",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const app = container();
      const proxy = mixins(counterStore);

      // Access via select first
      const selectedMixin = proxy.select(["count", "increment"]);

      // Then access directly - should use cached mixin
      const countMixin = proxy.count;
      const incrementMixin = proxy.increment;

      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec);
          return [instance.state, instance.actions] as const;
        },
      } as SelectorContext;

      // All should work correctly
      const selected = selectedMixin(mockCtx);
      expect(selected.count).toBe(0);
      expect(countMixin(mockCtx)).toBe(0);
      expect(typeof incrementMixin(mockCtx)).toBe("function");
    });
  });

  describe("factory overload", () => {
    it("should return proxy for accessing service properties as mixins", () => {
      const dbService = (resolver: any) => ({
        users: {
          getAll: () => [{ id: 1, name: "John" }],
        },
        posts: {
          getAll: () => [{ id: 1, title: "Post 1" }],
        },
      });

      const app = container();
      const proxy = mixins(dbService);

      const mockCtx: SelectorContext = {
        get: (factory) => {
          return app.get(factory as any);
        },
      } as SelectorContext;

      // Access service property as mixin
      const usersMixin = proxy.users;
      const users = usersMixin(mockCtx);
      expect(users).toBeDefined();
      expect(users.getAll).toBeDefined();
      expect(users.getAll()).toEqual([{ id: 1, name: "John" }]);

      const postsMixin = proxy.posts;
      const posts = postsMixin(mockCtx);
      expect(posts).toBeDefined();
      expect(posts.getAll).toBeDefined();
      expect(posts.getAll()).toEqual([{ id: 1, title: "Post 1" }]);
    });

    it("should work with service that has nested properties", () => {
      const apiService = (resolver: any) => ({
        auth: {
          login: (email: string) => ({ token: "token123" }),
          logout: () => {},
        },
        data: {
          fetch: () => ({ data: [] }),
        },
      });

      const app = container();
      const proxy = mixins(apiService);

      const mockCtx: SelectorContext = {
        get: (factory) => {
          return app.get(factory as any);
        },
      } as SelectorContext;

      const authMixin = proxy.auth;
      const auth = authMixin(mockCtx);
      expect(auth.login).toBeDefined();
      expect(auth.logout).toBeDefined();
      expect(auth.login("test@example.com")).toEqual({ token: "token123" });

      const dataMixin = proxy.data;
      const data = dataMixin(mockCtx);
      expect(data.fetch).toBeDefined();
      expect(data.fetch()).toEqual({ data: [] });
    });

    it("should distinguish between StoreSpec and Factory", () => {
      const counterStore = store({
        name: "counter",
        state: { count: 0 },
        setup: ({ state }) => ({
          increment: () => {
            state.count++;
          },
        }),
      });

      const dbService = (resolver: any) => ({
        query: () => [],
      });

      const app = container();

      // StoreSpec should return MixinProxy (state/actions)
      const storeProxy = mixins(counterStore);
      const mockCtx: SelectorContext = {
        get: (spec) => {
          const instance = app.get(spec as any);
          if (isSpec(spec)) {
            return [instance.state, instance.actions] as const;
          }
          return instance;
        },
      } as SelectorContext;

      // Store proxy should access state/actions
      const countMixin = storeProxy.count;
      expect(countMixin(mockCtx)).toBe(0);

      const incrementMixin = storeProxy.increment;
      expect(typeof incrementMixin(mockCtx)).toBe("function");

      // Factory proxy should access service properties
      const factoryProxy = mixins(dbService);
      const queryMixin = factoryProxy.query;
      expect(typeof queryMixin(mockCtx)).toBe("function");
    });
  });
});
