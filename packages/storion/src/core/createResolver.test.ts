import { describe, it, expect, vi } from "vitest";
import {
  createResolver,
  Factory,
  Middleware,
  when,
  createLoggingMiddleware,
  createValidationMiddleware,
} from "./createResolver";

describe("createResolver", () => {
  describe("get", () => {
    it("should create instance from factory", () => {
      const factory: Factory<{ value: number }> = () => ({ value: 42 });
      const resolver = createResolver();

      const instance = resolver.get(factory);

      expect(instance).toEqual({ value: 42 });
    });

    it("should cache and return same instance", () => {
      let callCount = 0;
      const factory: Factory<{ id: number }> = () => ({ id: ++callCount });
      const resolver = createResolver();

      const first = resolver.get(factory);
      const second = resolver.get(factory);

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    it("should pass resolver to factory for dependencies", () => {
      const configFactory: Factory<{ apiUrl: string }> = () => ({
        apiUrl: "https://api.example.com",
      });

      const serviceFactory: Factory<{ url: string }> = (resolver) => {
        const config = resolver.get(configFactory);
        return { url: config.apiUrl };
      };

      const resolver = createResolver();
      const service = resolver.get(serviceFactory);

      expect(service.url).toBe("https://api.example.com");
    });
  });

  describe("create", () => {
    it("should create fresh instance each time", () => {
      let callCount = 0;
      const factory: Factory<{ id: number }> = () => ({ id: ++callCount });
      const resolver = createResolver();

      const first = resolver.create(factory);
      const second = resolver.create(factory);

      expect(first).not.toBe(second);
      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
    });

    it("should not affect cache", () => {
      let callCount = 0;
      const factory: Factory<{ id: number }> = () => ({ id: ++callCount });
      const resolver = createResolver();

      resolver.create(factory); // id: 1
      const cached = resolver.get(factory); // id: 2, cached
      resolver.create(factory); // id: 3, fresh
      const stillCached = resolver.get(factory); // still id: 2

      expect(cached.id).toBe(2);
      expect(stillCached).toBe(cached);
    });
  });

  describe("set (override)", () => {
    it("should override factory with custom implementation", () => {
      const original: Factory<string> = () => "original";
      const override: Factory<string> = () => "override";
      const resolver = createResolver();

      resolver.set(original, override);
      const result = resolver.get(original);

      expect(result).toBe("override");
    });

    it("should invalidate cache when setting override", () => {
      const factory: Factory<string> = () => "original";
      const resolver = createResolver();

      const first = resolver.get(factory);
      expect(first).toBe("original");

      resolver.set(factory, () => "override");
      const second = resolver.get(factory);

      expect(second).toBe("override");
    });

    it("should be useful for testing with mocks", () => {
      const realService: Factory<{ fetch: () => string }> = () => ({
        fetch: () => "real data",
      });

      const mockService: Factory<{ fetch: () => string }> = () => ({
        fetch: () => "mock data",
      });

      const resolver = createResolver();
      resolver.set(realService, mockService);

      const service = resolver.get(realService);
      expect(service.fetch()).toBe("mock data");
    });
  });

  describe("has", () => {
    it("should return false for uncached factory", () => {
      const factory: Factory<number> = () => 42;
      const resolver = createResolver();

      expect(resolver.has(factory)).toBe(false);
    });

    it("should return true for cached factory", () => {
      const factory: Factory<number> = () => 42;
      const resolver = createResolver();

      resolver.get(factory);

      expect(resolver.has(factory)).toBe(true);
    });
  });

  describe("tryGet", () => {
    it("should return undefined for uncached factory", () => {
      const factory: Factory<number> = () => 42;
      const resolver = createResolver();

      expect(resolver.tryGet(factory)).toBeUndefined();
    });

    it("should return cached instance without creating", () => {
      const factory: Factory<number> = () => 42;
      const resolver = createResolver();

      resolver.get(factory);
      const result = resolver.tryGet(factory);

      expect(result).toBe(42);
    });
  });

  describe("delete", () => {
    it("should remove cached instance", () => {
      const factory: Factory<{ id: number }> = () => ({ id: Math.random() });
      const resolver = createResolver();

      const first = resolver.get(factory);
      expect(resolver.has(factory)).toBe(true);

      const deleted = resolver.delete(factory);
      expect(deleted).toBe(true);
      expect(resolver.has(factory)).toBe(false);

      const second = resolver.get(factory);
      expect(second).not.toBe(first);
    });

    it("should return false if not cached", () => {
      const factory: Factory<number> = () => 42;
      const resolver = createResolver();

      expect(resolver.delete(factory)).toBe(false);
    });

    it("should call dispose() on instance if present", () => {
      const disposeFn = vi.fn();
      const factory: Factory<{ dispose: () => void }> = () => ({
        dispose: disposeFn,
      });
      const resolver = createResolver();

      resolver.get(factory);
      resolver.delete(factory);

      expect(disposeFn).toHaveBeenCalledTimes(1);
    });

    it("should not throw if instance has no dispose method", () => {
      const factory: Factory<{ value: number }> = () => ({ value: 42 });
      const resolver = createResolver();

      resolver.get(factory);

      expect(() => resolver.delete(factory)).not.toThrow();
    });
  });

  describe("clear", () => {
    it("should remove all cached instances", () => {
      const factory1: Factory<number> = () => 1;
      const factory2: Factory<number> = () => 2;
      const resolver = createResolver();

      resolver.get(factory1);
      resolver.get(factory2);

      resolver.clear();

      expect(resolver.has(factory1)).toBe(false);
      expect(resolver.has(factory2)).toBe(false);
    });

    it("should call dispose() on all instances that have it", () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const factory1: Factory<{ dispose: () => void }> = () => ({
        dispose: dispose1,
      });
      const factory2: Factory<{ dispose: () => void }> = () => ({
        dispose: dispose2,
      });
      const factory3: Factory<number> = () => 42; // No dispose

      const resolver = createResolver();

      resolver.get(factory1);
      resolver.get(factory2);
      resolver.get(factory3);

      resolver.clear();

      expect(dispose1).toHaveBeenCalledTimes(1);
      expect(dispose2).toHaveBeenCalledTimes(1);
    });
  });

  describe("scope", () => {
    it("should create child resolver with parent lookup", () => {
      const factory: Factory<string> = () => "parent value";
      const parent = createResolver();
      parent.get(factory); // cache in parent

      const child = parent.scope();

      // Child should find parent's cached value
      expect(child.has(factory)).toBe(true);
      expect(child.get(factory)).toBe("parent value");
    });

    it("should allow child to override without affecting parent", () => {
      const factory: Factory<string> = () => "parent";
      const parent = createResolver();
      parent.get(factory);

      const child = parent.scope();
      child.set(factory, () => "child override");

      expect(parent.get(factory)).toBe("parent");
      expect(child.get(factory)).toBe("child override");
    });

    it("should inherit middleware by default", () => {
      const calls: string[] = [];
      const middleware: Middleware = (ctx) => {
        calls.push("middleware");
        return ctx.next();
      };

      const parent = createResolver({ middleware: [middleware] });
      const child = parent.scope();

      const factory: Factory<number> = () => 42;
      child.get(factory);

      expect(calls).toEqual(["middleware"]);
    });

    it("should allow custom middleware in scope", () => {
      const calls: string[] = [];
      const parentMiddleware: Middleware = (ctx) => {
        calls.push("parent");
        return ctx.next();
      };
      const childMiddleware: Middleware = (ctx) => {
        calls.push("child");
        return ctx.next();
      };

      const parent = createResolver({ middleware: [parentMiddleware] });
      const child = parent.scope({ middleware: [childMiddleware] });

      const factory: Factory<number> = () => 42;
      child.get(factory);

      expect(calls).toEqual(["child"]); // Only child middleware, not parent
    });
  });

  describe("middleware", () => {
    it("should call middleware in order", () => {
      const calls: string[] = [];

      const first: Middleware = (ctx) => {
        calls.push("first-before");
        const result = ctx.next();
        calls.push("first-after");
        return result;
      };

      const second: Middleware = (ctx) => {
        calls.push("second-before");
        const result = ctx.next();
        calls.push("second-after");
        return result;
      };

      const resolver = createResolver({ middleware: [first, second] });
      const factory: Factory<number> = () => {
        calls.push("factory");
        return 42;
      };

      resolver.get(factory);

      expect(calls).toEqual([
        "first-before",
        "second-before",
        "factory",
        "second-after",
        "first-after",
      ]);
    });

    it("should receive correct context", () => {
      const factory: Factory<number> = () => 42;
      let capturedCtx: any;

      const middleware: Middleware = (ctx) => {
        capturedCtx = ctx;
        return ctx.next();
      };

      const resolver = createResolver({ middleware: [middleware] });
      resolver.get(factory);

      expect(capturedCtx.factory).toBe(factory);
      expect(capturedCtx.resolver).toBe(resolver);
      expect(typeof capturedCtx.next).toBe("function");
    });

    it("should allow middleware to transform result", () => {
      const doubleMiddleware: Middleware = (ctx) => {
        const result = ctx.next();
        return (typeof result === "number" ? result * 2 : result) as any;
      };

      const resolver = createResolver({ middleware: [doubleMiddleware] });
      const factory: Factory<number> = () => 21;

      expect(resolver.get(factory)).toBe(42);
    });

    it("should allow middleware to short-circuit", () => {
      const cacheMiddleware: Middleware = () => {
        // Always return cached value, never call factory
        return "cached" as any;
      };

      const factoryFn = vi.fn(() => "from factory");
      const resolver = createResolver({ middleware: [cacheMiddleware] });

      const result = resolver.get(factoryFn);

      expect(result).toBe("cached");
      expect(factoryFn).not.toHaveBeenCalled();
    });

    it("should apply middleware to create() as well", () => {
      const calls: string[] = [];
      const middleware: Middleware = (ctx) => {
        calls.push("middleware");
        return ctx.next();
      };

      const resolver = createResolver({ middleware: [middleware] });
      const factory: Factory<number> = () => 42;

      resolver.create(factory);
      resolver.create(factory);

      expect(calls).toEqual(["middleware", "middleware"]);
    });
  });

  describe("when helper", () => {
    it("should apply middleware only when predicate matches", () => {
      const calls: string[] = [];

      // Use named function declarations
      function namedFactory() {
        return "named";
      }
      function anonFactory() {
        return "anon";
      }

      const middleware = when(
        (factory) => factory.name === "namedFactory",
        (ctx) => {
          calls.push("applied");
          return ctx.next();
        }
      );

      const resolver = createResolver({ middleware: [middleware] });

      resolver.get(namedFactory);
      resolver.get(anonFactory);

      expect(calls).toEqual(["applied"]); // Only called for namedFactory
    });
  });

  describe("createLoggingMiddleware", () => {
    it("should log factory creation", () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(" "));

      const middleware = createLoggingMiddleware("Test");
      const resolver = createResolver({ middleware: [middleware] });

      // Use a named function instead of assigning to .name
      function myFactory() {
        return 42;
      }

      resolver.get(myFactory);

      console.log = originalLog;

      expect(logs[0]).toContain("[Test] Creating: myFactory");
      expect(logs[1]).toContain("[Test] Created: myFactory");
    });
  });

  describe("createValidationMiddleware", () => {
    it("should validate factory result", () => {
      const middleware = createValidationMiddleware((result) => {
        if (result === null) {
          throw new Error("Result cannot be null");
        }
      });

      const resolver = createResolver({ middleware: [middleware] });
      const nullFactory: Factory<null> = () => null;

      expect(() => resolver.get(nullFactory)).toThrow("Result cannot be null");
    });

    it("should pass valid results through", () => {
      const middleware = createValidationMiddleware((result) => {
        if (typeof result !== "number") {
          throw new Error("Must be number");
        }
      });

      const resolver = createResolver({ middleware: [middleware] });
      const factory: Factory<number> = () => 42;

      expect(resolver.get(factory)).toBe(42);
    });
  });

  describe("real-world scenarios", () => {
    it("should support dependency injection pattern", () => {
      // Define services
      const configFactory: Factory<{ apiUrl: string }> = () => ({
        apiUrl: "https://api.example.com",
      });

      const loggerFactory: Factory<{ log: (msg: string) => void }> = () => ({
        log: (msg) => console.log(msg),
      });

      const apiClientFactory: Factory<{ baseUrl: string }> = (resolver) => {
        const config = resolver.get(configFactory);
        return { baseUrl: config.apiUrl };
      };

      const userServiceFactory: Factory<{ apiUrl: string }> = (resolver) => {
        const client = resolver.get(apiClientFactory);
        return { apiUrl: client.baseUrl };
      };

      // Production
      const prod = createResolver();
      expect(prod.get(userServiceFactory).apiUrl).toBe(
        "https://api.example.com"
      );

      // Testing with mock
      const test = createResolver();
      test.set(configFactory, () => ({ apiUrl: "http://localhost:3000" }));
      expect(test.get(userServiceFactory).apiUrl).toBe("http://localhost:3000");
    });

    it("should support scoped overrides for testing", () => {
      const dbFactory: Factory<{ query: () => string }> = () => ({
        query: () => "real db",
      });

      const serviceFactory: Factory<{ getData: () => string }> = (
        resolver
      ) => ({
        getData: () => resolver.get(dbFactory).query(),
      });

      // Production resolver
      const prod = createResolver();
      expect(prod.get(serviceFactory).getData()).toBe("real db");

      // Test scope with mock db
      const testScope = prod.scope();
      testScope.set(dbFactory, () => ({ query: () => "mock db" }));
      expect(testScope.get(serviceFactory).getData()).toBe("mock db");

      // Production unaffected
      expect(prod.get(serviceFactory).getData()).toBe("real db");
    });
  });
});
