/**
 * Proxy utilities for state access and dependency tracking.
 */

import { trackRead, trackWrite } from "./tracking";

// =============================================================================
// Types
// =============================================================================

export interface StateProxyOptions {
  /** Unique store ID for tracking */
  storeId: string;

  /** Whether the proxy allows writes */
  mutable: boolean;

  /** Equality function per property */
  getEquality: (key: string) => (a: unknown, b: unknown) => boolean;

  /** Called when a property value changes */
  onPropertyChange?: (
    key: string,
    oldValue: unknown,
    newValue: unknown
  ) => void;
}

export interface TrackingProxyOptions {
  /** Unique store ID for tracking */
  storeId: string;

  /** Callback when a property is accessed */
  onAccess?: (storeId: string, propKey: string, value: unknown) => void;
}

// =============================================================================
// State Proxy
// =============================================================================

/**
 * Creates a state proxy for store state.
 *
 * @param rawState - The raw state object
 * @param options - Proxy configuration
 * @returns Proxied state object
 */
export function createStateProxy<T extends Record<string, unknown>>(
  rawState: T,
  options: StateProxyOptions
): T {
  const { storeId, mutable, getEquality, onPropertyChange } = options;

  const proxy = new Proxy(rawState, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;

      const value = target[prop as keyof T];

      // Track read for reactive effects
      trackRead(storeId, prop, value);

      return value;
    },

    set(target, prop, value) {
      if (typeof prop !== "string") return false;

      if (!mutable) {
        console.warn(`Cannot set property "${prop}" on readonly state`);
        return false;
      }

      const oldValue = target[prop as keyof T];

      // Track write for self-reference detection
      trackWrite(storeId, prop, value, oldValue);

      const equality = getEquality(prop);

      // Check if value actually changed
      if (equality(oldValue, value)) {
        return true; // No change
      }

      // Update value
      (target as Record<string, unknown>)[prop] = value;

      // Notify change
      onPropertyChange?.(prop, oldValue, value);

      return true;
    },

    has(target, prop) {
      return prop in target;
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop !== "string") return undefined;

      const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (descriptor) {
        const value = target[prop as keyof T];
        trackRead(storeId, prop, value);
      }
      return descriptor;
    },
  });

  return proxy;
}

/**
 * Creates a readonly state proxy.
 * Reads are tracked, writes are rejected.
 */
export function createReadonlyStateProxy<T extends Record<string, unknown>>(
  rawState: T,
  storeId: string,
  getEquality: (key: string) => (a: unknown, b: unknown) => boolean
): Readonly<T> {
  return createStateProxy(rawState, {
    storeId,
    mutable: false,
    getEquality,
  }) as Readonly<T>;
}

/**
 * Creates a mutable state proxy.
 * Both reads and writes are tracked.
 */
export function createMutableStateProxy<T extends Record<string, unknown>>(
  rawState: T,
  storeId: string,
  getEquality: (key: string) => (a: unknown, b: unknown) => boolean,
  onPropertyChange: (key: string, oldValue: unknown, newValue: unknown) => void
): T {
  return createStateProxy(rawState, {
    storeId,
    mutable: true,
    getEquality,
    onPropertyChange,
  });
}

// =============================================================================
// Tracking Proxy (for useStore)
// =============================================================================

/**
 * Creates a tracking proxy for React's useStore hook.
 *
 * This proxy intercepts property reads and calls onAccess callback.
 * Respects `untrack()` when combined with hooks.
 *
 * @param state - The readonly state object
 * @param options - Tracking configuration
 * @returns Tracking proxy
 */
export function createTrackingProxy<T extends Record<string, unknown>>(
  state: Readonly<T>,
  options: TrackingProxyOptions
): Readonly<T> {
  const { storeId, onAccess } = options;

  return new Proxy(state as T, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;

      const value = target[prop as keyof T];

      // Record this access for subscription
      onAccess?.(storeId, prop, value);

      return value;
    },

    has(target, prop) {
      return prop in target;
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop !== "string") return undefined;

      const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (descriptor) {
        const value = target[prop as keyof T];
        onAccess?.(storeId, prop, value);
      }
      return descriptor;
    },
  }) as Readonly<T>;
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generates a unique store ID.
 */
export function generateStoreId(name?: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  return name ? `${name}_${random}` : `store_${random}`;
}
