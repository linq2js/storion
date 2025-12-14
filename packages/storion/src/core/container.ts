/**
 * Container implementation.
 *
 * Manages store instances - creation, caching, disposal.
 */

import type {
  StateBase,
  ActionsBase,
  StoreSpec,
  StoreInstance,
  StoreContainer,
  ContainerOptions,
} from "../types";

import {
  createStoreInstance,
  StoreResolver,
  CreateStoreInstanceOptions,
} from "./store";
import { emitter } from "../emitter";

/**
 * Create a store container.
 */
export function container(_options: ContainerOptions = {}): StoreContainer {
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
   * Resolver function passed to store instances.
   * Allows stores to get other stores via get().
   */
  const resolver: StoreResolver = <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A> => {
    return containerApi.get(spec);
  };

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
      // Prepare instance options for autoDispose
      const instanceOptions: CreateStoreInstanceOptions = {};

      if (spec._options.lifetime === "autoDispose") {
        // When refCount drops to 0, auto-dispose this store
        instanceOptions.onZeroRefs = () => {
          containerApi.dispose(spec);
        };
      }

      // Create instance
      instance = createStoreInstance(spec, resolver, instanceOptions);

      // Cache instance
      instancesBySpec.set(spec, instance);
      instancesById.set(instance.id, instance);
      creationOrder.push(spec);

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
    get<S extends StateBase, A extends ActionsBase>(
      spec: StoreSpec<S, A>
    ): StoreInstance<S, A> {
      return getOrCreateInstance(spec);
    },

    getById(id: string) {
      return instancesById.get(id);
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
          // Notify listeners before disposal via emitter
          disposeEmitter.emit(instance);

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

      // Notify listeners via emitter
      disposeEmitter.emit(instance);

      // Dispose instance
      instance.dispose();

      // Remove from caches
      instancesBySpec.delete(spec);
      instancesById.delete(instance.id);

      // Remove from creation order
      const index = creationOrder.indexOf(spec);
      if (index !== -1) {
        creationOrder.splice(index, 1);
      }

      return true;
    },

    onCreate(listener) {
      return createEmitter.on(listener);
    },

    onDispose(listener) {
      return disposeEmitter.on(listener);
    },
  };

  return containerApi;
}
