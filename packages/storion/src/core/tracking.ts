/**
 * Hooks infrastructure for intercepting store operations.
 *
 * This module provides a pure hooks system. Effect tracking and
 * selector tracking are implemented by consumers via withHooks().
 */

import type { StoreResolver } from "../types";

// Re-export effect types and function
export type {
  EffectRetryConfig,
  EffectErrorContext,
  EffectErrorStrategy,
  EffectOptions,
  RunEffectOptions,
  EffectContext,
  EffectFn,
} from "./effect";
export { effect } from "./effect";

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook event for property read.
 */
export interface ReadEvent {
  /** Store ID (use container.get(id) to get full instance) */
  storeId: string;
  /** Property name */
  prop: string;
  /** Value read */
  value: unknown;
  /** Store resolver - use to get instance and subscribe */
  resolver: StoreResolver;
}

/**
 * Hook event for property write.
 */
export interface WriteEvent {
  /** Store ID (use container.get(id) to get full instance) */
  storeId: string;
  /** Property name */
  prop: string;
  /** New value */
  next: unknown;
  /** Previous value */
  prev: unknown;
}

/**
 * Hooks for intercepting store operations.
 * Useful for devtools, logging, debugging, and dependency tracking.
 */
export interface Hooks {
  /** Called when a store property is read */
  onRead?: (event: ReadEvent) => void;

  /** Called when a store property is written */
  onWrite?: (event: WriteEvent) => void;

  scheduleNotification: (notify: () => void, key?: unknown) => void;

  /**
   * Schedule a function to run an effect.
   * @param runEffect - Function to run effect and return dispose effect function
   */
  scheduleEffect(
    runEffect: (options?: import("./effect").RunEffectOptions) => VoidFunction
  ): void;
}

let globalHooks: Hooks = {
  scheduleNotification(notify) {
    notify();
  },
  scheduleEffect(runEffect) {
    // in global scope, so we run effect immediately and no need dispose
    runEffect();
  },
};

/**
 * Get current hooks.
 */
export function getHooks(): Hooks {
  return globalHooks;
}

/**
 * Execute function with modified hooks (scoped).
 *
 * Hooks are restored after function completes, even if it throws.
 *
 * @overload Partial merge + scoped execution
 * @param hooks - Partial hooks to merge with current
 * @param fn - Function to execute with modified hooks
 *
 * @overload Setup function + scoped execution
 * @param setup - Function that receives current hooks and returns new hooks
 * @param fn - Function to execute with modified hooks
 *
 * @example
 * // Partial merge
 * withHooks({ onRead: myHandler }, () => {
 *   // globalHooks.onRead is myHandler here
 * });
 * // globalHooks restored
 *
 * @example
 * // Setup function - compose with existing hooks
 * withHooks((current) => ({
 *   onRead: (event) => {
 *     current.onRead?.(event); // Call existing hook (devtools)
 *     trackDependency(event);   // Add your tracking
 *   }
 * }), () => {
 *   // Both hooks active
 * });
 */
export function withHooks<T>(
  hooks: Partial<Hooks>,
  fn: () => T,
  onFinish?: () => void
): T;
export function withHooks<T>(
  setup: (current: Hooks) => Partial<Hooks>,
  fn: () => T,
  onFinish?: () => void
): T;
export function withHooks<T>(
  hooksOrSetup: Partial<Hooks> | ((current: Hooks) => Partial<Hooks>),
  fn: () => T,
  onFinish?: () => void
): T {
  const prev = globalHooks;

  if (typeof hooksOrSetup === "function") {
    globalHooks = {
      ...globalHooks,
      ...hooksOrSetup(prev),
    };
  } else {
    globalHooks = { ...prev, ...hooksOrSetup };
  }

  try {
    return fn();
  } finally {
    globalHooks = prev;
    onFinish?.();
  }
}

// =============================================================================
// Track Functions (called by proxies)
// =============================================================================

/**
 * Track a property read.
 * Called by state proxies when a property is accessed.
 */
export function trackRead(
  storeId: string,
  prop: string,
  value: unknown,
  resolver: StoreResolver
): void {
  globalHooks.onRead?.({ storeId, prop, value, resolver });
}

/**
 * Track a property write.
 * Called by state proxies when a property is set.
 */
export function trackWrite(
  storeId: string,
  prop: string,
  next: unknown,
  prev: unknown
): void {
  globalHooks.onWrite?.({ storeId, prop, next, prev });
}

// =============================================================================
// Untrack
// =============================================================================

/**
 * Execute function without triggering hooks.
 *
 * Use this to read state without creating dependencies.
 *
 * @example
 * effect((ctx) => {
 *   const tracked = state.count;        // Creates dependency
 *   const ignored = untrack(() => state.name);  // No dependency
 * });
 */
export function untrack<T>(fn: () => T): T {
  return withHooks({ onRead: undefined, onWrite: undefined }, fn);
}

// =============================================================================
// Batching
// =============================================================================

/**
 * Schedule a notification via current hooks.
 *
 * By default, notifications are called immediately.
 * Inside batch(), notifications are collected and deduped by key.
 *
 * @param notify - The notification function to schedule
 * @param key - Optional key for deduplication (defaults to notify function itself)
 */
export function scheduleNotification(notify: () => void, key?: unknown): void {
  globalHooks.scheduleNotification(notify, key);
}

/**
 * Batch multiple operations.
 *
 * Notifications scheduled during batch are collected, deduped by key,
 * and flushed after batch completes.
 *
 * @example
 * batch(() => {
 *   state.a = 1;
 *   state.b = 2;
 *   state.c = 3;
 *   // Only one notification per subscriber, not three
 * });
 */
export function batch<T>(fn: () => T): T {
  // Collect notifications by key during batch
  const pending = new Map<unknown, () => void>();

  return withHooks(
    (current) => ({
      ...current,
      scheduleNotification: (notify, key) => {
        // Use notify function as default key (dedupes same function)
        const actualKey = key ?? notify;
        pending.set(actualKey, notify);
      },
    }),
    fn,
    // Flush on finish
    () => {
      for (const notify of pending.values()) {
        notify();
      }
    }
  );
}
