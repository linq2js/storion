/**
 * createResolver - Factory-based dependency injection with middleware support.
 *
 * Features:
 * - Factory function support: resolver.get(factory) returns cached instance
 * - Override mechanism: resolver.set(factory, override) for DI/testing
 * - Middleware chain: intercept factory creation for logging, validation, etc.
 * - Scoped resolvers: resolver.scope() creates child resolver with parent lookup
 *
 * @example
 * ```ts
 * // Define factories
 * const userService = (resolver: Resolver) => new UserService();
 * const authService = (resolver: Resolver) => new AuthService(resolver.get(userService));
 *
 * // Create resolver with middleware
 * const app = createResolver({
 *   middleware: [loggingMiddleware],
 * });
 *
 * // Get instances (cached)
 * const auth = app.get(authService);
 *
 * // Testing - override with mock
 * const testApp = app.scope();
 * testApp.set(userService, () => mockUserService);
 * ```
 */

import type { Factory, Middleware, Resolver, ResolverOptions } from "../types";

// Re-export types for convenience
export type {
  Factory,
  Middleware,
  MiddlewareContext,
  Resolver,
  ResolverOptions,
} from "../types";

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a new resolver with optional middleware and parent.
 */
export function createResolver(options: ResolverOptions = {}): Resolver {
  const { middleware = [], parent } = options;

  // Cache: factory -> instance (uses factory reference as key)
  const cache = new Map<Factory, any>();

  // Overrides: factory -> replacement factory
  const overrides = new Map<Factory, Factory>();

  /**
   * Resolve factory to actual factory (respecting overrides).
   */
  const resolve = <T>(factory: Factory<T>): Factory<T> =>
    (overrides.get(factory) as Factory<T>) ?? factory;

  /**
   * Apply middleware chain and invoke factory.
   */
  const invoke = <T>(factory: Factory<T>, resolver: Resolver): T => {
    // Build middleware chain from right to left
    // Each middleware wraps the next, with factory invocation at the end
    const chain = middleware.reduceRight<() => T>(
      (next, mw) => () =>
        mw<T>({
          factory,
          resolver,
          next,
        }),
      () => factory(resolver)
    );

    return chain();
  };

  const resolver: Resolver = {
    get<T>(factory: Factory<T>): T {
      // Use original factory as cache key
      if (cache.has(factory)) {
        return cache.get(factory) as T;
      }

      // Only use parent cache if NO local overrides exist
      // (because local overrides might affect dependencies)
      if (parent && overrides.size === 0 && parent.has(factory)) {
        return parent.get(factory);
      }

      // Use mapped factory for creation
      const instance = invoke(resolve(factory), resolver);
      cache.set(factory, instance);
      return instance;
    },

    create<T>(factory: Factory<T>): T {
      // Use mapped factory for creation (no caching)
      return invoke(resolve(factory), resolver);
    },

    set<T>(factory: Factory<T>, override: Factory<T>): void {
      overrides.set(factory, override);
      // Invalidate cache for this factory
      cache.delete(factory);
    },

    has(factory: Factory): boolean {
      // Use original factory as cache key
      const inParent = parent && overrides.size === 0 && parent.has(factory);
      return cache.has(factory) || (inParent ?? false);
    },

    tryGet<T>(factory: Factory<T>): T | undefined {
      // Use original factory as cache key
      if (cache.has(factory)) {
        return cache.get(factory) as T;
      }

      // Only check parent if no local overrides
      if (parent && overrides.size === 0) {
        return parent.tryGet(factory);
      }

      return undefined;
    },

    delete(factory: Factory): boolean {
      // Use original factory as cache key
      return cache.delete(factory);
    },

    clear(): void {
      cache.clear();
    },

    scope(scopeOptions: ResolverOptions = {}): Resolver {
      return createResolver({
        middleware: scopeOptions.middleware ?? middleware,
        parent: resolver,
        ...scopeOptions,
      });
    },
  };

  return resolver;
}

// =============================================================================
// Built-in Middleware Helpers
// =============================================================================

/**
 * Create a middleware that only applies to factories matching a predicate.
 *
 * @example
 * ```ts
 * const storeOnlyMiddleware = when(
 *   (factory) => is(factory, "store.spec"),
 *   (ctx) => {
 *     console.log("Creating store:", ctx.factory.name);
 *     return ctx.next();
 *   }
 * );
 * ```
 */
export function when(
  predicate: (factory: Factory) => boolean,
  middleware: Middleware
): Middleware {
  return (ctx) => {
    if (predicate(ctx.factory)) {
      return middleware(ctx);
    }
    return ctx.next();
  };
}

/**
 * Create a logging middleware for debugging.
 *
 * @example
 * ```ts
 * const app = createResolver({
 *   middleware: [createLoggingMiddleware("App")],
 * });
 * ```
 */
export function createLoggingMiddleware(prefix = "Resolver"): Middleware {
  return (ctx) => {
    const name = ctx.factory.name || "anonymous";
    console.log(`[${prefix}] Creating: ${name}`);
    const start = performance.now();
    const result = ctx.next();
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[${prefix}] Created: ${name} (${duration}ms)`);
    return result;
  };
}

/**
 * Create a middleware that validates factory results.
 *
 * @example
 * ```ts
 * const validateMiddleware = createValidationMiddleware((result) => {
 *   if (result === null || result === undefined) {
 *     throw new Error("Factory returned null/undefined");
 *   }
 * });
 * ```
 */
export function createValidationMiddleware(
  validate: (result: unknown, factory: Factory) => void
): Middleware {
  return (ctx) => {
    const result = ctx.next();
    validate(result, ctx.factory);
    return result;
  };
}
