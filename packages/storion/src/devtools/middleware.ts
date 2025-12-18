/**
 * Devtools middleware for storion.
 *
 * This middleware:
 * - Tracks all stores created in the container
 * - Injects __revertState and __takeSnapshot actions
 * - Records state history (last N changes)
 * - Exposes a controller to window.__STORION_DEVTOOLS__
 */

import type {
  StoreMiddleware,
  StoreSpec,
  StoreInstance,
  StateBase,
  ActionsBase,
} from "../types";
import { STORION_TYPE } from "../types";
import { createStoreInstance } from "../core/store";
import { createDevtoolsController } from "./controller";
import type {
  DevtoolsController,
  DevtoolsMiddlewareOptions,
  DevtoolsActions,
} from "./types";

/**
 * Create the devtools middleware.
 *
 * @example
 * ```ts
 * import { container } from "storion";
 * import { devtoolsMiddleware } from "storion/devtools";
 *
 * const app = container({
 *   middleware: [devtoolsMiddleware()],
 * });
 * ```
 */
export function devtoolsMiddleware(
  options: DevtoolsMiddlewareOptions = {}
): StoreMiddleware {
  const {
    maxHistory = 5,
    windowObject = typeof window !== "undefined" ? window : undefined,
  } = options;

  // Create or reuse controller
  let controller: DevtoolsController;

  if (windowObject) {
    const key = "__STORION_DEVTOOLS__";
    if (!(windowObject as any)[key]) {
      controller = createDevtoolsController(maxHistory);
      (windowObject as any)[key] = controller;
    } else {
      controller = (windowObject as any)[key];
    }
  } else {
    controller = createDevtoolsController(maxHistory);
  }

  // Internal methods on controller
  const registerStore = (controller as any)._registerStore as (
    entry: any
  ) => void;
  const unregisterStore = (controller as any)._unregisterStore as (
    id: string
  ) => void;
  const recordStateChange = (controller as any)._recordStateChange as (
    id: string,
    state: any,
    action?: string,
    actionArgs?: unknown[]
  ) => void;

  // Return middleware function
  return <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>,
    next: (spec: StoreSpec<S, A>) => StoreInstance<S, A>
  ): StoreInstance<S, A> => {
    // Wrap the setup function to inject devtools actions
    const originalSetup = spec.options.setup;

    // Create modified options with devtools actions injected
    const modifiedOptions = {
      ...spec.options,
      setup: (context: any) => {
        // Call original setup
        const originalActions = originalSetup(context);

        // Create devtools actions
        const devtoolsActions: DevtoolsActions = {
          __revertState: (newState: Record<string, unknown>) => {
            // Use update to replace state
            context.update(() => newState as any);
          },
          __takeSnapshot: () => {
            // Trigger a snapshot (placeholder - controller handles this)
          },
        };

        // Return merged actions
        return {
          ...originalActions,
          ...devtoolsActions,
        } as A & DevtoolsActions;
      },
    };

    // Create a new callable spec with modified options
    // StoreSpec is now a callable function that creates instances
    const modifiedSpec = function (resolver: any) {
      return createStoreInstance(modifiedSpec as any, resolver, {});
    } as StoreSpec<S, A>;

    // Assign properties to make it a valid StoreSpec
    Object.defineProperties(modifiedSpec, {
      [STORION_TYPE]: { value: "store.spec", enumerable: false },
      name: { value: spec.name, enumerable: true, writable: false },
      options: { value: modifiedOptions, enumerable: true, writable: false },
    });

    // Create instance with modified spec
    const instance = next(modifiedSpec);

    // Register store with devtools
    registerStore({
      id: instance.id,
      name: spec.name,
      state: { ...instance.state },
      disposed: false,
      instance,
      createdAt: Date.now(),
      meta: spec.options.meta,
    });

    // Track last action for associating with state changes
    let lastAction: { name: string; args: unknown[] } | null = null;

    // Subscribe to action dispatches to track which action caused the change
    const unsubscribeActions = instance.subscribe("@*", (event: any) => {
      const { next } = event;
      // Skip devtools internal actions
      if (typeof next.name === "string" && next.name.startsWith("__")) return;
      lastAction = { name: next.name, args: next.args };
    });

    // Subscribe to STATE changes (fires after mutations complete)
    const unsubscribeState = instance.subscribe(() => {
      recordStateChange(
        instance.id,
        { ...instance.state },
        lastAction?.name,
        lastAction?.args
      );
      lastAction = null; // Reset after recording
    });

    // Handle disposal
    instance.onDispose(() => {
      unsubscribeActions();
      unsubscribeState();
      unregisterStore(instance.id);
    });

    return instance;
  };
}

/**
 * Get the devtools controller from window.
 */
export function getDevtoolsController(): DevtoolsController | undefined {
  if (typeof window !== "undefined") {
    return (window as any).__STORION_DEVTOOLS__;
  }
  return undefined;
}
