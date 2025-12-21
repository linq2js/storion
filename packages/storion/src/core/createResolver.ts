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

import type {
  Factory,
  FactoryMiddlewareContext,
  MetaEntry,
  Middleware,
  Resolver,
  ResolverOptions,
  StoreInstance,
  StoreMiddlewareContext,
  StoreSpec,
} from "../types";
import { isSpec } from "../is";
import { tryDispose } from "./disposable";
import { createMetaQuery } from "../meta/createMetaQuery";

// Re-export types for convenience
export type {
  Factory,
  Middleware,
  MiddlewareContext,
  Resolver,
  ResolverOptions,
} from "../types";

/**
 * Extract displayName from a factory function.
 * - For StoreSpec: uses spec.displayName
 * - For factory with displayName property: uses factory.displayName
 * - For named function: uses function.name
 * - Otherwise: undefined
 */
function extractDisplayName(factory: Factory): string | undefined {
  // Check if it's a store spec
  if (isSpec(factory)) {
    return (factory as StoreSpec).displayName;
  }

  // Check for displayName property (custom annotation)
  if (
    typeof (factory as any).displayName === "string" &&
    (factory as any).displayName
  ) {
    return (factory as any).displayName;
  }

  // Fall back to function name if it exists and is not anonymous
  if (factory.name && factory.name !== "") {
    return factory.name;
  }

  return undefined;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a new resolver with optional middleware and parent.
 */
export function createResolver(options: ResolverOptions = {}): Resolver {
  const {
    middleware = [],
    parent,
    invokeResolver: invokeResolverOption,
  } = options;

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
   * Extract meta entries from factory (via withMeta) if present.
   */
  const extractFactoryMeta = (factory: Factory): MetaEntry[] => {
    const meta = (factory as any).meta;
    if (!meta) return [];
    return Array.isArray(meta) ? meta : [meta];
  };

  /**
   * Apply middleware chain and invoke factory.
   * Detects if factory is a store spec and creates appropriate context type.
   *
   * @param factory - The factory to invoke
   * @param resolverForCtx - The resolver to pass in middleware context (usually invokeResolver ?? self)
   */
  const invoke = <T>(factory: Factory<T>, resolverForCtx: Resolver): T => {
    // Detect if this is a store spec
    const isStoreSpec = isSpec(factory);
    const displayName = extractDisplayName(factory);

    // Collect meta entries from factory (withMeta) and spec (for stores)
    const factoryMeta = extractFactoryMeta(factory);
    const specMeta = isStoreSpec ? (factory as StoreSpec).meta ?? [] : [];
    const allMeta = [...factoryMeta, ...specMeta];
    const meta = createMetaQuery(allMeta);

    // Build middleware chain from right to left
    // Each middleware wraps the next, with factory invocation at the end
    const chain = middleware.reduceRight<() => unknown>(
      (next, mw) => () => {
        // Create discriminated context based on factory type
        if (isStoreSpec) {
          const ctx: StoreMiddlewareContext = {
            type: "store",
            factory,
            resolver: resolverForCtx,
            next: next as () => StoreInstance,
            displayName: displayName!,
            spec: factory as StoreSpec,
            meta,
          };
          return mw(ctx);
        } else {
          const ctx: FactoryMiddlewareContext = {
            type: "factory",
            factory,
            resolver: resolverForCtx,
            next,
            displayName,
            meta,
          };
          return mw(ctx);
        }
      },
      () => factory(resolverForCtx)
    );

    return chain() as T;
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
      // Pass invokeResolver if provided (for container to inject itself)
      const instance = invoke(
        resolve(factory),
        invokeResolverOption ?? resolver
      );
      cache.set(factory, instance);
      return instance;
    },

    create<T>(factory: Factory<T>, ...args: any[]): T {
      // Use mapped factory for creation (no caching)
      // Pass invokeResolver if provided (for container to inject itself)
      const resolverForCtx = invokeResolverOption ?? resolver;

      // If additional args provided, this is a parameterized factory
      // Call directly without middleware (parameterized factories are simple creators)
      if (args.length > 0) {
        return (factory as any)(resolverForCtx, ...args);
      }

      // Standard factory - use middleware chain
      return invoke(resolve(factory), resolverForCtx);
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
      const instance = cache.get(factory);
      if (instance) {
        // Try to call dispose if the instance has it
        tryDispose(instance);
        cache.delete(factory);
        return true;
      }
      return false;
    },

    clear(): void {
      // Try to dispose all cached instances
      for (const instance of cache.values()) {
        tryDispose(instance);
      }
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
