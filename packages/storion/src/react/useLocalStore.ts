/**
 * useLocalStore - Creates a component-scoped store instance.
 *
 * Unlike global stores (via container), local stores are:
 * - Created fresh for each component instance
 * - Disposed when the component unmounts
 * - Isolated - cannot have dependencies on other stores
 *
 * Works correctly with React StrictMode which:
 * - Renders twice in development
 * - Runs effect → cleanup → effect again
 *
 * The controller pattern handles this by:
 * - Using commit/uncommit to track if effect is active
 * - Deferring disposal via microtask to survive StrictMode's cleanup-then-rerun
 */

import { useLayoutEffect, useMemo, useRef, useReducer } from "react";
import { container } from "../core/container";
import {
  ActionsBase,
  StateBase,
  StoreContainer,
  StoreInstance,
  StoreSpec,
} from "../types";

/**
 * Result type for useLocalStore.
 * Returns [state, actions, utilities] tuple.
 */
export type LocalStoreResult<
  TState extends StateBase,
  TActions extends ActionsBase
> = readonly [
  Readonly<TState>,
  TActions,
  Pick<StoreInstance<TState, TActions>, "dirty" | "reset">
];

/**
 * Create a component-local store instance.
 *
 * The store is created when the component mounts and disposed when it unmounts.
 * Each component instance gets its own isolated store.
 *
 * @example
 * ```tsx
 * const formSpec = store({
 *   name: "form",
 *   state: { name: "", email: "" },
 *   setup({ state }) {
 *     return {
 *       setName: (name: string) => { state.name = name; },
 *       setEmail: (email: string) => { state.email = email; },
 *     };
 *   },
 * });
 *
 * function ContactForm() {
 *   const form = useLocalStore(formSpec);
 *   // Each ContactForm instance has its own form state
 *   return (
 *     <input
 *       value={form.state.name}
 *       onChange={(e) => form.actions.setName(e.target.value)}
 *     />
 *   );
 * }
 * ```
 *
 * @param spec - Store specification (must not have dependencies)
 * @returns Store instance scoped to this component
 * @throws Error if the store has dependencies on other stores
 */
export function useLocalStore<
  TState extends StateBase,
  TActions extends ActionsBase
>(spec: StoreSpec<TState, TActions>): LocalStoreResult<TState, TActions> {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Track previous controller for cleanup on spec change
  const prevControllerRef = useRef<LocalStoreController<
    TState,
    TActions
  > | null>(null);

  // Create controller (memoized per spec)
  const controller = useMemo(() => new LocalStoreController(spec), [spec]);

  // Handle spec changes - dispose old controller
  if (prevControllerRef.current !== controller) {
    prevControllerRef.current?.dispose();
    prevControllerRef.current = controller;
  }

  // Get or create the store instance
  const store = controller.getStore();

  // Effect handles subscription and lifecycle
  // StrictMode: effect → cleanup → effect (controller survives via commit/uncommit)
  useLayoutEffect(() => {
    // Mark as committed - prevents disposal during StrictMode remount
    controller.commit();

    // Subscribe to store changes for re-renders
    const unsubscribe = store.subscribe(() => forceUpdate());

    return () => {
      unsubscribe();
      // Mark as uncommitted - schedules deferred disposal check
      controller.uncommit();
    };
  }, [controller, store]);

  return useMemo(
    () =>
      [
        store.state,
        store.actions,
        { dirty: store.dirty, reset: store.reset },
      ] as const,
    [store]
  );
}

/**
 * Controller manages store lifecycle with StrictMode support.
 *
 * The commit/uncommit pattern ensures:
 * - Store survives StrictMode's cleanup-then-rerun cycle
 * - Store is properly disposed on actual unmount
 * - Render-only instances (no effect commit) are cleaned up
 */
class LocalStoreController<
  TState extends StateBase,
  TActions extends ActionsBase
> {
  /** Whether the effect has committed (is active) */
  private _committed = false;

  /** Whether this controller has been disposed */
  private _disposed = false;

  /** Isolated container for this local store */
  private _container: StoreContainer | undefined;

  /** The store instance */
  private _store: StoreInstance<TState, TActions> | undefined;

  constructor(public readonly spec: StoreSpec<TState, TActions>) {}

  /**
   * Dispose the controller and its store.
   * Safe to call multiple times.
   */
  dispose = () => {
    if (this._disposed) return;
    this._disposed = true;
    this._store?.dispose();
    this._container?.clear();
    this._store = undefined;
    this._container = undefined;
  };

  /**
   * Schedule disposal check via microtask.
   *
   * This deferred check is crucial for StrictMode:
   * - StrictMode runs cleanup then effect again synchronously
   * - The microtask runs AFTER the re-commit, so store survives
   * - On real unmount, no re-commit happens, so disposal proceeds
   */
  private _disposeIfUnused = () => {
    // Skip if already committed or disposed
    if (this._committed || this._disposed) return;

    // Defer check to next microtask
    // This allows StrictMode's effect re-run to commit before we check
    Promise.resolve().then(() => {
      // If still not committed after microtask, it's a real unmount
      if (!this._committed) {
        this.dispose();
      }
    });
  };

  /**
   * Get or create the store instance.
   * Throws if the store has dependencies (local stores must be isolated).
   */
  getStore = (): StoreInstance<TState, TActions> => {
    if (this._store) return this._store;

    // Create isolated container for this local store
    if (!this._container) {
      this._container = container();
    }

    this._store = this._container.get(this.spec);

    // Local stores cannot have dependencies
    const depsCount = this._store?.deps?.length ?? 0;
    if (depsCount > 0) {
      this.dispose();
      throw new Error(
        `Local store must not have dependencies, but "${this.spec.name}" has ${depsCount} dependencies. ` +
          `Use useStore() with a global container for stores with dependencies.`
      );
    }

    // Schedule cleanup if effect never commits (render-only)
    this._disposeIfUnused();

    return this._store;
  };

  /**
   * Mark as committed (effect is active).
   * Called at the start of useLayoutEffect.
   */
  commit = () => {
    this._committed = true;
  };

  /**
   * Mark as uncommitted (effect cleaned up).
   * Schedules deferred disposal check.
   */
  uncommit = () => {
    this._committed = false;
    this._disposeIfUnused();
  };
}
