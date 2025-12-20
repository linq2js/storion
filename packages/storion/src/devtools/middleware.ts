/**
 * Devtools middleware for storion.
 *
 * This middleware:
 * - Tracks all stores created in the container
 * - Injects __revertState and __takeSnapshot actions for stores
 * - Records state history (last N changes)
 * - Exposes a controller to window.__STORION_DEVTOOLS__
 */

import type {
  Middleware,
  MiddlewareContext,
  StoreSpec,
  StoreInstance,
} from "../types";
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
): Middleware {
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

  // Return middleware - handles both stores and factories
  return (ctx: MiddlewareContext): unknown => {
    // Only track stores
    if (ctx.type !== "store") {
      return ctx.next();
    }

    const { spec } = ctx;

    // Call ctx.next() to continue middleware chain, then enhance the instance
    const instance = ctx.next() as StoreInstance;

    // Enhance instance with devtools features
    return enhanceStoreWithDevtools(
      instance,
      spec,
      registerStore,
      unregisterStore,
      recordStateChange
    );
  };
}

/**
 * Enhance an existing store instance with devtools features.
 * This is called AFTER ctx.next() to allow middleware chain to continue.
 */
function enhanceStoreWithDevtools(
  instance: StoreInstance,
  spec: StoreSpec,
  registerStore: (entry: any) => void,
  unregisterStore: (id: string) => void,
  recordStateChange: (
    id: string,
    state: any,
    action?: string,
    actionArgs?: unknown[]
  ) => void
): StoreInstance {
  // Add devtools actions to the instance
  const devtoolsActions: DevtoolsActions = {
    __revertState: (newState: Record<string, unknown>) => {
      // Use hydrate with force to replace state even if dirty
      instance.hydrate(newState, { force: true });
    },
    __takeSnapshot: () => {
      // Trigger a snapshot (placeholder - controller handles this)
    },
  };

  // Merge devtools actions into instance.actions
  Object.assign(instance.actions, devtoolsActions);

  // Register store with devtools
  registerStore({
    id: instance.id,
    name: spec.displayName,
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
