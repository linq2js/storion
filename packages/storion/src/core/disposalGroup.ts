/**
 * DisposalGroup - Coordinates disposal across multiple collections.
 *
 * When items are moved between collections in the same group (e.g., from listA to listB),
 * the disposal is cancelled because the item is still alive in the group.
 */

import type { AutoDisposeOptions } from "../types";
import { tryDispose } from "./disposable";

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/**
 * Check if value is an object (can have dispose method).
 * Primitives (string, number, boolean, etc.) are skipped for disposal tracking.
 */
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

// =============================================================================
// NAMED GROUP REGISTRY
// =============================================================================

const namedGroups = new Map<string, DisposalGroup>();

/**
 * Get or create a disposal group by name.
 * Named groups are shared across all collections using the same name.
 */
export function getNamedGroup(name: string): DisposalGroup {
  let group = namedGroups.get(name);
  if (!group) {
    group = disposalGroup();
    namedGroups.set(name, group);
  }
  return group;
}

// =============================================================================
// AUTO-DISPOSE OPTIONS
// =============================================================================

/**
 * Full options for auto-dispose with group and grace period.
 */
export interface FocusAutoDisposeOptions {
  /** Disposal group - either a DisposalGroup instance or a named group string */
  group?: DisposalGroup | string;
  /** Grace period in ms before disposing (default: 0) */
  gracePeriodMs?: number;
}

/**
 * Unified auto-dispose option type.
 * - `false` / `undefined`: No auto-disposal
 * - `true`: Dispose immediately via microtask
 * - `number`: Grace period in ms (e.g., `100` = 100ms delay)
 * - `string`: Named group (shared across collections using same name)
 * - `DisposalGroup`: Direct group instance
 * - `{ group, gracePeriodMs }`: Full options object
 */
export type FocusAutoDispose =
  | boolean
  | number
  | string
  | DisposalGroup
  | FocusAutoDisposeOptions;

/**
 * Normalized result of parsing autoDispose option.
 */
export interface NormalizedAutoDispose {
  enabled: true;
  gracePeriodMs: number;
  group: DisposalGroup | null;
}

/**
 * Check if value is a DisposalGroup.
 */
function isDisposalGroup(value: unknown): value is DisposalGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    "scheduleDisposal" in value &&
    "cancelDisposal" in value &&
    "isPending" in value &&
    "flush" in value
  );
}

/**
 * Normalize autoDispose option to a standard format.
 */
export function normalizeAutoDispose(
  autoDispose: FocusAutoDispose | undefined
): NormalizedAutoDispose | false {
  if (autoDispose === false || autoDispose === undefined) {
    return false;
  }

  if (autoDispose === true) {
    return { enabled: true, gracePeriodMs: 0, group: null };
  }

  if (typeof autoDispose === "number") {
    return { enabled: true, gracePeriodMs: autoDispose, group: null };
  }

  if (typeof autoDispose === "string") {
    return {
      enabled: true,
      gracePeriodMs: 0,
      group: getNamedGroup(autoDispose),
    };
  }

  if (isDisposalGroup(autoDispose)) {
    return { enabled: true, gracePeriodMs: 0, group: autoDispose };
  }

  // Full options object
  const opts = autoDispose as FocusAutoDisposeOptions;
  let group: DisposalGroup | null = null;

  if (opts.group) {
    group =
      typeof opts.group === "string" ? getNamedGroup(opts.group) : opts.group;
  }

  return {
    enabled: true,
    gracePeriodMs: opts.gracePeriodMs ?? 0,
    group,
  };
}

/**
 * @deprecated Use normalizeAutoDispose instead
 */
export function normalizeAutoDisposeOptions(
  autoDispose: boolean | AutoDisposeOptions | undefined
): AutoDisposeOptions | false {
  if (autoDispose === false || autoDispose === undefined) return false;
  if (autoDispose === true) return { gracePeriodMs: 0 };
  return autoDispose;
}

// =============================================================================
// DISPOSAL GROUP
// =============================================================================

/**
 * Disposal group for coordinating disposal across multiple collections.
 *
 * @example
 * ```ts
 * const group = disposalGroup();
 *
 * const listA = focus('listA').as(list({ group }));
 * const listB = focus('listB').as(list({ group }));
 *
 * // Moving item from A to B won't dispose it
 * const item = listA.pop();  // schedules disposal in group
 * listB.push(item);          // cancels disposal because item is still in group
 * ```
 */
export interface DisposalGroup {
  /**
   * Schedule items for disposal.
   * Items will be disposed after the grace period unless cancelled.
   */
  scheduleDisposal(items: unknown[], gracePeriodMs: number): void;

  /**
   * Cancel disposal for items that are being re-added.
   */
  cancelDisposal(items: unknown[]): void;

  /**
   * Check if an item is pending disposal.
   */
  isPending(item: unknown): boolean;

  /**
   * Force immediate disposal of all pending items.
   */
  flush(): void;
}

/**
 * Create a disposal group for coordinating disposal across collections.
 */
export function disposalGroup(): DisposalGroup {
  const pendingItems = new Map<
    object,
    ReturnType<typeof setTimeout> | "microtask"
  >();

  return {
    scheduleDisposal(items: unknown[], gracePeriodMs: number): void {
      for (const item of items) {
        if (!isObject(item)) continue;
        if (pendingItems.has(item)) continue; // Already scheduled

        if (gracePeriodMs <= 0) {
          // Use microtask for immediate disposal
          pendingItems.set(item, "microtask");
          queueMicrotask(() => {
            if (pendingItems.get(item) === "microtask") {
              pendingItems.delete(item);
              tryDispose(item);
            }
          });
        } else {
          // Use setTimeout for delayed disposal
          const timeout = setTimeout(() => {
            pendingItems.delete(item);
            tryDispose(item);
          }, gracePeriodMs);
          pendingItems.set(item, timeout);
        }
      }
    },

    cancelDisposal(items: unknown[]): void {
      for (const item of items) {
        if (!isObject(item)) continue;
        const pending = pendingItems.get(item);
        if (pending === undefined) continue;

        if (pending !== "microtask") {
          clearTimeout(pending);
        }
        pendingItems.delete(item);
      }
    },

    isPending(item: unknown): boolean {
      return isObject(item) && pendingItems.has(item);
    },

    flush(): void {
      for (const [item, pending] of pendingItems) {
        if (pending !== "microtask") {
          clearTimeout(pending);
        }
        tryDispose(item);
      }
      pendingItems.clear();
    },
  };
}

// =============================================================================
// LOCAL TRACKER (for collections without a group)
// =============================================================================

/**
 * Create a local disposal tracker for a single collection.
 * Uses microtask scheduling with cancellation support.
 */
export function createLocalDisposalTracker(gracePeriodMs: number) {
  const pendingItems = new Map<
    object,
    ReturnType<typeof setTimeout> | "microtask"
  >();

  return {
    scheduleDisposal(items: unknown[]): void {
      for (const item of items) {
        if (!isObject(item)) continue;
        if (pendingItems.has(item)) continue;

        if (gracePeriodMs <= 0) {
          pendingItems.set(item, "microtask");
          queueMicrotask(() => {
            if (pendingItems.get(item) === "microtask") {
              pendingItems.delete(item);
              tryDispose(item);
            }
          });
        } else {
          const timeout = setTimeout(() => {
            pendingItems.delete(item);
            tryDispose(item);
          }, gracePeriodMs);
          pendingItems.set(item, timeout);
        }
      }
    },

    cancelDisposal(items: unknown[]): void {
      for (const item of items) {
        if (!isObject(item)) continue;
        const pending = pendingItems.get(item);
        if (pending === undefined) continue;

        if (pending !== "microtask") {
          clearTimeout(pending);
        }
        pendingItems.delete(item);
      }
    },

    isPending(item: unknown): boolean {
      return isObject(item) && pendingItems.has(item);
    },
  };
}
