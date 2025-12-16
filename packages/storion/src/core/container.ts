/**
 * Container implementation.
 *
 * Manages store instances - creation, caching, disposal.
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreInstance,
  type StoreContainer,
  type StoreResolver,
  type ContainerOptions,
  type StoreMiddleware,
} from "../types";

import { createStoreInstance } from "./store";
import { emitter } from "../emitter";
import { untrack } from "./tracking";

/**
 * Create a store container.
 */
export function container(options: ContainerOptions = {}): StoreContainer {
  const { middleware = [] } = options;

  // Instance cache: spec → instance
  const instancesBySpec = new Map<
    StoreSpec<any, any>,
    StoreInstance<any, any>
  >();

  // Instance cache: id → instance (for tracking lookup)
  const instancesById = new Map<string, StoreInstance<any, any>>();

  // Creation order (for disposal in reverse order)
  const creationOrder: StoreSpec<any, any>[] = [];

  // Lifecycle emitters
  const createEmitter = emitter<StoreInstance<any, any>>();
  const disposeEmitter = emitter<StoreInstance<any, any>>();

  // Currently creating (for circular dependency detection)
  const creating = new Set<StoreSpec<any, any>>();

  // ==========================================================================
  // Resolver
  // ==========================================================================

  /**
   * Resolver object passed to store instances.
   * Allows stores to get other stores via get().
   */
  const resolver: StoreResolver = {
    get<S extends StateBase, A extends ActionsBase>(
      specOrId: StoreSpec<S, A> | string
    ): any {
      if (typeof specOrId === "string") {
        return instancesById.get(specOrId);
      }
      return containerApi.get(specOrId);
    },
    has(spec) {
      return instancesBySpec.has(spec);
    },
  };

  // ==========================================================================
  // Create Instance (core logic)
  // ==========================================================================

  function createInstance<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A> {
    // Create instance
    const instance = createStoreInstance(spec, resolver, {
      autoDispose: options.autoDispose,
    });

    instance.onDispose(() => {
      // Notify listeners via emitter
      disposeEmitter.emit(instance);

      // Remove from caches
      instancesBySpec.delete(spec);
      instancesById.delete(instance.id);

      // Remove from creation order
      const index = creationOrder.indexOf(spec);
      if (index !== -1) {
        creationOrder.splice(index, 1);
      }
    });

    return instance;
  }

  // ==========================================================================
  // Middleware Chain
  // ==========================================================================

  /**
   * Build middleware chain: each middleware wraps the next.
   * Final function in chain is the actual createInstance.
   */
  function buildMiddlewareChain(): <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ) => StoreInstance<S, A> {
    // Start with the core create function
    let chain: StoreMiddleware = (_spec, next) => next(_spec);

    // Wrap in reverse order so first middleware runs first
    for (let i = middleware.length - 1; i >= 0; i--) {
      const currentMiddleware = middleware[i];
      const nextInChain = chain;
      chain = (spec, next) =>
        currentMiddleware(spec, (s) => nextInChain(s, next));
    }

    // Return function that starts the chain
    return <S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>
    ) => chain(spec, createInstance) as StoreInstance<S, A>;
  }

  const createWithMiddleware = buildMiddlewareChain();

  // ==========================================================================
  // Get Instance
  // ==========================================================================

  function getOrCreateInstance<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A> {
    // Check cache
    let instance = instancesBySpec.get(spec);
    if (instance) {
      return instance as StoreInstance<S, A>;
    }

    // Check for circular dependency
    if (creating.has(spec)) {
      const name = spec.name ?? "unknown";
      throw new Error(
        `Circular dependency detected: "${name}" is being created while it's already in the creation stack.`
      );
    }

    // Mark as creating
    creating.add(spec);

    try {
      // Create instance through middleware chain
      // untrack to avoid tracking the creation of the instance
      instance = untrack(() => createWithMiddleware(spec));

      // Cache instance
      instancesBySpec.set(spec, instance);
      instancesById.set(instance.id, instance);
      creationOrder.push(spec);

      // Clean up container when instance is disposed directly
      instance.onDispose?.(() => {
        instancesBySpec.delete(spec);
        instancesById.delete(instance!.id);
        const index = creationOrder.indexOf(spec);
        if (index !== -1) {
          creationOrder.splice(index, 1);
        }
      });

      // Notify listeners via emitter
      createEmitter.emit(instance);

      return instance as StoreInstance<S, A>;
    } finally {
      // Unmark creating
      creating.delete(spec);
    }
  }

  // ==========================================================================
  // Container API
  // ==========================================================================

  const containerApi: StoreContainer = {
    [STORION_TYPE]: "container",

    get<S extends StateBase, A extends ActionsBase>(
      specOrId: StoreSpec<S, A> | string
    ): any {
      if (typeof specOrId === "string") {
        return instancesById.get(specOrId);
      }
      return getOrCreateInstance(specOrId);
    },

    has(spec) {
      return instancesBySpec.has(spec);
    },

    clear() {
      // Dispose in reverse creation order
      const specs = [...creationOrder].reverse();

      for (const spec of specs) {
        const instance = instancesBySpec.get(spec);
        if (instance) {
          instance.dispose();

          // Remove from id map
          instancesById.delete(instance.id);
        }
      }

      instancesBySpec.clear();
      creationOrder.length = 0;
    },

    dispose(spec) {
      const instance = instancesBySpec.get(spec);
      if (!instance) return false;

      // Dispose instance
      instance.dispose();

      return true;
    },

    onCreate: createEmitter.on,

    onDispose: disposeEmitter.on,
  };

  return containerApi;
}
