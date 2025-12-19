/**
 * Container implementation.
 *
 * A specialized resolver for stores that adds:
 * - ID lookup for store instances
 * - Lifecycle events (onCreate, onDispose)
 * - Ordered disposal
 *
 * Delegates to resolver for caching, overrides, and middleware.
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreInstance,
  type StoreContainer,
  type ContainerOptions,
  type Middleware,
  type Resolver,
} from "../types";

import { emitter } from "../emitter";
import { untrack } from "./tracking";
import { isSpec } from "../is";
import { createResolver } from "./createResolver";
import { tryDispose } from "./disposable";

// ==========================================================================
// Default Middleware
// ==========================================================================

interface DefaultMiddlewareConfig {
  /** Middleware to run before container's middleware */
  pre?: Middleware[];
  /** Middleware to run after container's middleware */
  post?: Middleware[];
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
 * Container wraps a resolver and adds store-specific features:
 * - get(id): lookup store by instance ID
 * - onCreate/onDispose: lifecycle events
 * - Ordered disposal (reverse creation order)
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

  // Store-specific tracking
  const instancesById = new Map<string, StoreInstance<any, any>>();
  const creationOrder: StoreSpec<any, any>[] = [];

  // Lifecycle emitters
  const createEmitter = emitter<StoreInstance<any, any>>();
  const disposeEmitter = emitter<StoreInstance<any, any>>();

  // Parent container (for scoped containers)
  const parent = options._parent;

  // Forward declaration for resolver setup
  let containerApi: StoreContainer;

  // Create internal resolver with middleware
  // Pass containerApi as invokeResolver so stores get container for DI
  const internalResolver = createResolver({
    middleware,
    parent: parent as Resolver | undefined,
    get invokeResolver() {
      return containerApi as unknown as Resolver;
    },
  });

  /**
   * Setup store-specific tracking after creation.
   */
  function trackStore(
    spec: StoreSpec<any, any>,
    instance: StoreInstance<any, any>
  ): void {
    instancesById.set(instance.id, instance);
    creationOrder.push(spec);

    // Setup disposal cleanup
    if (typeof instance.onDispose === "function") {
      instance.onDispose(() => {
        disposeEmitter.emit(instance);
        instancesById.delete(instance.id);
        // Remove from resolver cache
        internalResolver.delete(spec);
        const index = creationOrder.indexOf(spec);
        if (index !== -1) {
          creationOrder.splice(index, 1);
        }
      });
    }

    // Emit creation event
    createEmitter.emit(instance);
  }

  // ==========================================================================
  // Container API
  // ==========================================================================

  containerApi = {
    [STORION_TYPE]: "container",

    // Get by ID or factory/spec
    get(specOrIdOrFactory: any): any {
      // ID lookup (store-specific)
      if (typeof specOrIdOrFactory === "string") {
        return instancesById.get(specOrIdOrFactory);
      }

      // Check if already cached (for stores, track on first creation)
      const wasCached = internalResolver.has(specOrIdOrFactory);

      // Delegate to resolver
      const instance = untrack(() => internalResolver.get(specOrIdOrFactory));

      // Track stores on first creation
      if (!wasCached && isSpec(specOrIdOrFactory)) {
        trackStore(specOrIdOrFactory, instance as StoreInstance<any, any>);
      }

      return instance;
    },

    create(specOrFactory: any, ...args: any[]): any {
      // Delegate to resolver (no caching)
      const instance = untrack(() =>
        internalResolver.create(specOrFactory, ...(args as any))
      );

      // Track stores (but not in creation order since it's a fresh instance)
      if (isSpec(specOrFactory)) {
        const storeInstance = instance as StoreInstance<any, any>;
        instancesById.set(storeInstance.id, storeInstance);

        if (typeof storeInstance.onDispose === "function") {
          storeInstance.onDispose(() => {
            disposeEmitter.emit(storeInstance);
            instancesById.delete(storeInstance.id);
          });
        }
      }

      return instance;
    },

    set<S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>,
      override: StoreSpec<S, A>
    ): void {
      // Dispose existing instance if any
      const existing = internalResolver.tryGet(spec) as
        | StoreInstance<S, A>
        | undefined;
      tryDispose(existing);
      internalResolver.set(spec, override);
    },

    has(spec: StoreSpec<any, any>): boolean {
      return internalResolver.has(spec);
    },

    tryGet<S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>
    ): StoreInstance<S, A> | undefined {
      return internalResolver.tryGet(spec) as StoreInstance<S, A> | undefined;
    },

    delete(spec: StoreSpec<any, any>): boolean {
      const instance = internalResolver.tryGet(spec) as
        | StoreInstance<any, any>
        | undefined;
      if (instance) {
        // dispose() triggers onDispose which removes from resolver
        tryDispose(instance);
        return true;
      }
      return false;
    },

    clear(): void {
      // Dispose in reverse creation order
      const specs = [...creationOrder].reverse();
      for (const spec of specs) {
        const instance = internalResolver.tryGet(spec) as
          | StoreInstance<any, any>
          | undefined;
        tryDispose(instance);
      }
      internalResolver.clear();
      instancesById.clear();
      creationOrder.length = 0;
    },

    dispose(spec: StoreSpec<any, any>): boolean {
      return containerApi.delete(spec);
    },

    scope(scopeOptions: ContainerOptions = {}): StoreContainer {
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
