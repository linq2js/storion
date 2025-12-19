/**
 * Container implementation.
 *
 * Manages store instances with resolver pattern:
 * - Factory-based dependency injection
 * - Caching (singleton per spec)
 * - Override support for testing
 * - Scoped containers
 * - Lifecycle events
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreInstance,
  type StoreContainer,
  type ContainerOptions,
  type StoreMiddleware,
  type StoreMiddlewareContext,
  type Factory,
  type Resolver,
} from "../types";

import { emitter } from "../emitter";
import { untrack } from "./tracking";
import { isSpec } from "../is";

// ==========================================================================
// Default Middleware
// ==========================================================================

interface DefaultMiddlewareConfig {
  /** Middleware to run before container's middleware */
  pre?: StoreMiddleware[];
  /** Middleware to run after container's middleware */
  post?: StoreMiddleware[];
}

let defaultMiddlewareConfig: DefaultMiddlewareConfig = {};

/**
 * Internal container options (includes parent for scoped containers).
 */
interface InternalContainerOptions extends ContainerOptions {
  /** Parent container for scoped lookups (internal use) */
  _parent?: StoreContainer;
}

/**
 * Container function with static defaults method.
 */
interface ContainerFn {
  (options?: ContainerOptions): StoreContainer;
  /**
   * Add default middleware that will be applied to all new containers.
   */
  defaults: {
    (config?: DefaultMiddlewareConfig): void;
    clear(): void;
  };
}

/**
 * Create a store container.
 *
 * Container provides resolver methods plus store-specific lifecycle:
 * - get(spec): cached instance
 * - create(spec): fresh instance
 * - set(spec, override): override for DI/testing
 * - has(spec): check cache
 * - tryGet(spec): get if cached
 * - delete(spec): remove from cache
 * - clear(): dispose all
 * - scope(): child container
 * - onCreate/onDispose: lifecycle events
 */
export const container: ContainerFn = function (
  options: InternalContainerOptions = {}
): StoreContainer {
  // Merge: pre + container's middleware + post
  const middleware = [
    ...(defaultMiddlewareConfig.pre ?? []),
    ...(options.middleware ?? []),
    ...(defaultMiddlewareConfig.post ?? []),
  ];

  // Instance cache: spec → instance
  const cache = new Map<StoreSpec<any, any>, StoreInstance<any, any>>();

  // Factory cache: factory → instance (for plain factory functions)
  const factoryCache = new Map<Factory<unknown>, unknown>();

  // Instance cache: id → instance (for ID lookup)
  const instancesById = new Map<string, StoreInstance<any, any>>();

  // Overrides: spec → replacement spec
  const overrides = new Map<StoreSpec<any, any>, StoreSpec<any, any>>();

  // Factory overrides: factory → replacement factory
  const factoryOverrides = new Map<Factory<unknown>, Factory<unknown>>();

  // Creation order (for disposal in reverse order)
  const creationOrder: StoreSpec<any, any>[] = [];

  // Lifecycle emitters
  const createEmitter = emitter<StoreInstance<any, any>>();
  const disposeEmitter = emitter<StoreInstance<any, any>>();

  // Currently creating (for circular dependency detection)
  const creating = new Set<StoreSpec<any, any>>();

  // Currently creating factories (for circular dependency detection)
  const creatingFactories = new Set<Factory<unknown>>();

  // Parent container (for scoped containers)
  const parent = options._parent;

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Resolve spec to actual spec (respecting overrides).
   */
  const resolve = <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreSpec<S, A> => (overrides.get(spec) as StoreSpec<S, A>) ?? spec;

  /**
   * Build middleware chain for store creation.
   * Uses StoreMiddlewareContext which always has `spec` available.
   * Middleware runs in order: first middleware wraps second, etc.
   */
  function buildMiddlewareChain(): <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ) => StoreInstance<S, A> {
    // Return function that builds and executes the chain
    return <S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>
    ): StoreInstance<S, A> => {
      // Build the chain starting from the first middleware
      let index = 0;

      const executeNext = (): StoreInstance<S, A> => {
        if (index >= middleware.length) {
          // End of chain - invoke the factory
          return spec(containerApi as any);
        }

        const currentMiddleware = middleware[index];
        index++;

        // Create context for this middleware (spec is always present)
        const ctx: StoreMiddlewareContext<S, A> = {
          spec,
          factory: spec,
          resolver: containerApi as Resolver,
          next: executeNext,
          displayName: spec.displayName,
        };

        return currentMiddleware(ctx);
      };

      return executeNext();
    };
  }

  const createWithMiddleware = buildMiddlewareChain();

  /**
   * Create instance and set up disposal handling.
   */
  function createInstance<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A> {
    const instance = untrack(() => createWithMiddleware(spec));

    // Set up disposal cleanup (if instance supports it)
    // Middleware may return mock instances without onDispose
    if (typeof instance.onDispose === "function") {
      instance.onDispose(() => {
        disposeEmitter.emit(instance);
        cache.delete(spec);
        instancesById.delete(instance.id);
        const index = creationOrder.indexOf(spec);
        if (index !== -1) {
          creationOrder.splice(index, 1);
        }
      });
    }

    return instance;
  }

  // ==========================================================================
  // Container API (implements Resolver + container-specific methods)
  // ==========================================================================

  const containerApi: StoreContainer = {
    [STORION_TYPE]: "container",

    // ========================================================================
    // Resolver Methods
    // ========================================================================

    // Implementation handles multiple overloads
    get(specOrIdOrFactory: any): any {
      // ID lookup
      if (typeof specOrIdOrFactory === "string") {
        return instancesById.get(specOrIdOrFactory);
      }

      // Plain factory function (not a StoreSpec)
      if (!isSpec(specOrIdOrFactory)) {
        const factory = specOrIdOrFactory as Factory<unknown>;

        // Check local cache
        if (factoryCache.has(factory)) {
          return factoryCache.get(factory);
        }

        // Check parent
        if (
          parent &&
          factoryOverrides.size === 0 &&
          "tryGet" in parent &&
          typeof (parent as any).tryGet === "function"
        ) {
          const parentInstance = (parent as any).tryGet(factory);
          if (parentInstance !== undefined) {
            return parentInstance;
          }
        }

        // Circular dependency check
        if (creatingFactories.has(factory)) {
          const name = factory.name || "anonymous";
          throw new Error(
            `Circular dependency detected: factory "${name}" is being created while already in creation stack.`
          );
        }

        creatingFactories.add(factory);

        try {
          // Get mapped factory (respecting overrides)
          const mapped =
            (factoryOverrides.get(factory) as Factory<unknown>) ?? factory;
          // Create instance - pass container as resolver
          const instance = mapped(containerApi as any);
          // Cache with original factory as key
          factoryCache.set(factory, instance);
          return instance;
        } finally {
          creatingFactories.delete(factory);
        }
      }

      const spec = specOrIdOrFactory;

      // Check local cache (use original spec as key)
      if (cache.has(spec)) {
        return cache.get(spec);
      }

      // Check parent (only if no local overrides)
      if (parent && overrides.size === 0 && parent.has(spec)) {
        return parent.get(spec);
      }

      // Circular dependency check
      if (creating.has(spec)) {
        const name = spec.displayName ?? "unknown";
        throw new Error(
          `Circular dependency detected: "${name}" is being created while already in creation stack.`
        );
      }

      creating.add(spec);

      try {
        // Create instance using mapped spec
        const mapped = resolve(spec);
        const instance = createInstance(mapped);

        // Cache with original spec as key
        cache.set(spec, instance);
        instancesById.set(instance.id, instance);
        creationOrder.push(spec);

        // Emit creation event
        createEmitter.emit(instance);

        return instance;
      } finally {
        creating.delete(spec);
      }
    },

    // Implementation handles both StoreSpec and Factory overloads
    create(specOrFactory: any): any {
      // Handle plain factory functions
      if (!isSpec(specOrFactory)) {
        const factory = specOrFactory as Factory<unknown>;
        // Get mapped factory (respecting overrides)
        const mapped =
          (factoryOverrides.get(factory) as Factory<unknown>) ?? factory;
        // Create fresh instance (no caching) - pass container as resolver
        return mapped(containerApi as any);
      }

      // Create fresh store instance using mapped spec (no caching)
      const mapped = resolve(specOrFactory);
      return createInstance(mapped);
    },

    set<S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>,
      override: StoreSpec<S, A>
    ): void {
      overrides.set(spec, override);
      // Invalidate cache - dispose existing instance if any
      const existing = cache.get(spec);
      if (existing) {
        existing.dispose();
      }
    },

    has(spec: StoreSpec<any, any>): boolean {
      const inParent = parent && overrides.size === 0 && parent.has(spec);
      return cache.has(spec) || (inParent ?? false);
    },

    tryGet<S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>
    ): StoreInstance<S, A> | undefined {
      if (cache.has(spec)) {
        return cache.get(spec) as StoreInstance<S, A>;
      }
      if (parent && overrides.size === 0) {
        return parent.tryGet(spec);
      }
      return undefined;
    },

    delete(spec: StoreSpec<any, any>): boolean {
      const instance = cache.get(spec);
      if (instance) {
        instance.dispose();
        return true;
      }
      return false;
    },

    // ========================================================================
    // Container-Specific Methods
    // ========================================================================

    clear(): void {
      // Dispose in reverse creation order
      const specs = [...creationOrder].reverse();
      for (const spec of specs) {
        const instance = cache.get(spec);
        if (instance) {
          instance.dispose();
        }
      }
      cache.clear();
      instancesById.clear();
      creationOrder.length = 0;
    },

    dispose(spec: StoreSpec<any, any>): boolean {
      return containerApi.delete(spec);
    },

    scope(scopeOptions: ContainerOptions = {}): StoreContainer {
      // Create child container with this as parent
      return container({
        ...options,
        ...scopeOptions,
        middleware: scopeOptions.middleware ?? middleware,
        _parent: containerApi,
      } as InternalContainerOptions);
    },

    onCreate: createEmitter.on,
    onDispose: disposeEmitter.on,
  };

  return containerApi;
};

// ==========================================================================
// Default Middleware Configuration
// ==========================================================================

const defaultsFn = (config: DefaultMiddlewareConfig = {}): void => {
  defaultMiddlewareConfig = {
    pre: [...(defaultMiddlewareConfig.pre ?? []), ...(config.pre ?? [])],
    post: [...(defaultMiddlewareConfig.post ?? []), ...(config.post ?? [])],
  };
};
defaultsFn.clear = (): void => {
  defaultMiddlewareConfig = {};
};

container.defaults = defaultsFn;
