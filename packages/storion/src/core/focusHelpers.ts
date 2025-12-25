/**
 * Focus Helpers - Convenient APIs for common state mutations.
 *
 * These helpers transform a Focus into an ergonomic API for arrays and objects,
 * eliminating the need for reducer/updater patterns.
 */

import type { Focus, PickEquality } from "../types";
import { tryDispose } from "./disposable";

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/**
 * Check if value is an object (can have dispose method).
 * Primitives (string, number, boolean, etc.) are skipped for disposal tracking.
 */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Creates a disposal tracker that handles async disposal with cancellation support.
 *
 * Supports the use case where items are removed and re-added before disposal runs.
 * Uses immutable Set references to detect changes and skip stale disposals.
 *
 * Only tracks objects - primitives are skipped since they can't have dispose methods.
 */
function createDisposalTracker() {
  let pendingDisposedItems: Set<object> = new Set();
  let disposalScheduled = false;

  return {
    /**
     * Schedule items for async disposal.
     * Items will be disposed in a microtask unless cancelled.
     * Only objects are tracked - primitives are skipped.
     */
    scheduleDisposal(items: unknown[]): void {
      if (items.length === 0) return;

      // Add only objects to pending set (create new immutable set)
      const newPending = new Set(pendingDisposedItems);
      let hasNewItems = false;
      for (const item of items) {
        if (isObject(item)) {
          newPending.add(item);
          hasNewItems = true;
        }
      }

      if (!hasNewItems) return;

      pendingDisposedItems = newPending;

      // Schedule disposal if not already scheduled
      if (!disposalScheduled) {
        disposalScheduled = true;
        queueMicrotask(() => {
          disposalScheduled = false;
          const toDispose = pendingDisposedItems;
          pendingDisposedItems = new Set();

          for (const item of toDispose) {
            tryDispose(item);
          }
        });
      }
    },

    /**
     * Cancel disposal for items that are being re-added.
     * Call this when items are pushed/inserted back into the collection.
     * Only objects are checked - primitives are skipped.
     */
    cancelDisposal(items: unknown[]): void {
      if (items.length === 0 || pendingDisposedItems.size === 0) return;

      // Check if any object items need cancellation
      let hasChanges = false;
      for (const item of items) {
        if (isObject(item) && pendingDisposedItems.has(item)) {
          hasChanges = true;
          break;
        }
      }

      if (!hasChanges) return;

      // Remove items from pending set (create new immutable set)
      const newPending = new Set(pendingDisposedItems);
      for (const item of items) {
        if (isObject(item)) {
          newPending.delete(item);
        }
      }
      pendingDisposedItems = newPending;
    },

    /**
     * Check if an item is pending disposal.
     */
    isPending(item: unknown): boolean {
      return isObject(item) && pendingDisposedItems.has(item);
    },
  };
}

// =============================================================================
// REDUCER HELPERS
// =============================================================================

/**
 * Toggle a boolean value. Works with undefined (treats as false).
 *
 * @example
 * ```ts
 * list.set(0, toggle());        // toggles item at index 0
 * map.set('active', toggle());  // toggles 'active' key
 * ```
 */
export function toggle(): (prev: boolean | undefined) => boolean {
  return (prev: boolean | undefined) => !prev;
}

/**
 * Increment a number by a given amount (default: 1).
 *
 * @example
 * ```ts
 * map.set('count', increment());     // +1
 * map.set('count', increment(5));    // +5
 * ```
 */
export function increment(
  amount: number = 1
): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) + amount;
}

/**
 * Decrement a number by a given amount (default: 1).
 *
 * @example
 * ```ts
 * map.set('count', decrement());     // -1
 * map.set('count', decrement(5));    // -5
 * ```
 */
export function decrement(
  amount: number = 1
): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) - amount;
}

/**
 * Multiply a number by a factor.
 *
 * @example
 * ```ts
 * map.set('price', multiply(1.1));  // increase by 10%
 * map.set('price', multiply(2));    // double
 * ```
 */
export function multiply(factor: number): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) * factor;
}

/**
 * Divide a number by a divisor.
 *
 * @example
 * ```ts
 * map.set('price', divide(2));  // halve
 * ```
 */
export function divide(divisor: number): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) / divisor;
}

/**
 * Clamp a number within min/max bounds.
 *
 * @example
 * ```ts
 * map.set('volume', clamp(0, 100));  // ensure 0-100
 * ```
 */
export function clamp(
  min: number,
  max: number
): (prev: number | undefined) => number {
  return (prev: number | undefined) => Math.min(max, Math.max(min, prev ?? 0));
}

/**
 * Append string to existing value.
 *
 * @example
 * ```ts
 * map.set('log', append('\n' + message));
 * ```
 */
export function append(suffix: string): (prev: string | undefined) => string {
  return (prev: string | undefined) => (prev ?? "") + suffix;
}

/**
 * Prepend string to existing value.
 *
 * @example
 * ```ts
 * map.set('path', prepend('/prefix'));
 * ```
 */
export function prepend(prefix: string): (prev: string | undefined) => string {
  return (prev: string | undefined) => prefix + (prev ?? "");
}

/**
 * Shallow merge object properties.
 *
 * @example
 * ```ts
 * map.set('user', merge({ name: 'John' }));
 * map.set('settings', merge({ theme: 'dark' }));
 * ```
 */
export function merge<T extends object>(
  partial: Partial<T>
): (prev: T | undefined) => T {
  return (prev: T | undefined) => ({ ...prev, ...partial } as T);
}

/**
 * Reset to a default value (ignores previous).
 *
 * @example
 * ```ts
 * map.set('count', reset(0));
 * map.set('items', reset([]));
 * ```
 */
export function reset<T>(defaultValue: T): (prev: T | undefined) => T {
  return () => defaultValue;
}

// =============================================================================
// LIST HELPER
// =============================================================================

/**
 * Options for the list helper.
 */
export interface ListOptions {
  /** Auto-dispose items when removed. Defaults to false */
  autoDispose?: boolean;
}

/**
 * List API returned by the list() helper.
 */
export interface FocusList<T> {
  /** Get the current array or item at index */
  get: {
    /** Get the current array (returns defaultValue if undefined/null) */
    (): T[];
    /** Get item at index */
    (index: number): T | undefined;
  };
  /** Get the length of the array */
  length(): number;
  /** Check if array is empty */
  isEmpty(): boolean;
  /** Get the first item */
  first(): T | undefined;
  /** Get the last item */
  last(): T | undefined;
  /** Push item(s) to the end */
  push(...items: T[]): void;
  /** Add item(s) to the beginning */
  unshift(...items: T[]): void;
  /** Remove and return the last item (auto-disposes if enabled) */
  pop(): T | undefined;
  /** Remove and return the first item (auto-disposes if enabled) */
  shift(): T | undefined;
  /** Remove item(s) by reference (auto-disposes if enabled) */
  remove(...items: T[]): number;
  /** Remove item at index (auto-disposes if enabled) */
  removeAt(index: number): T | undefined;
  /** Remove items matching predicate (auto-disposes if enabled) */
  removeWhere(predicate: (item: T, index: number) => boolean): number;
  /** Insert item at index */
  insert(index: number, ...items: T[]): void;
  /**
   * Set item at index (auto-disposes old item if enabled).
   * Accepts direct value, reducer, or immer-style updater.
   *
   * @example
   * items.set(0, newItem);                     // Direct value
   * items.set(0, prev => ({ ...prev, done: true })); // Reducer
   * items.set(0, draft => { draft.done = true }); // Updater (mutates draft)
   */
  set(index: number, itemOrReducerOrUpdater: T | ((prev: T) => T | void)): void;
  /** Clear all items (auto-disposes all if enabled) */
  clear(): void;
  /** Replace entire array (auto-disposes old items if enabled) */
  replace(items: T[]): void;
  /** Find item matching predicate */
  find(predicate: (item: T, index: number) => boolean): T | undefined;
  /** Find index of item matching predicate */
  findIndex(predicate: (item: T, index: number) => boolean): number;
  /** Check if item exists */
  includes(item: T): boolean;
  /** Map items (read-only, doesn't mutate) */
  map<U>(fn: (item: T, index: number) => U): U[];
  /** Filter items (read-only, doesn't mutate) */
  filter(predicate: (item: T, index: number) => boolean): T[];
  /** Create a pick selector for fine-grained reactivity */
  pick(equality?: PickEquality<T[] | undefined | null>): T[];
}

/**
 * Create a list helper for array focus.
 * Handles undefined/null arrays gracefully.
 *
 * @example
 * ```ts
 * const todoStore = store({
 *   name: 'todos',
 *   state: { items: [] as TodoItem[] },
 *   setup({ focus }) {
 *     const items = focus('items').as(list());
 *     return {
 *       addTodo: (text: string) => items.push({ id: Date.now(), text, done: false }),
 *       removeTodo: (todo: TodoItem) => items.remove(todo),
 *       clearDone: () => items.removeWhere(item => item.done),
 *       clearAll: () => items.clear(),
 *     };
 *   },
 * });
 * ```
 */
export function list<T>(
  options?: ListOptions
): (
  focus:
    | Focus<T[] | undefined | null>
    | Focus<T[] | undefined>
    | Focus<T[] | null>
    | Focus<T[]>
) => FocusList<T> {
  const autoDispose = options?.autoDispose ?? false;

  return (inputFocus) => {
    // Cast to nullable type for internal use (implementation handles undefined/null)
    const focus = inputFocus as Focus<T[] | undefined | null>;
    const [getter, setter] = focus;
    const defaultValue: T[] = [];
    const tracker = autoDispose ? createDisposalTracker() : null;

    const getArray = (): T[] => getter() ?? defaultValue;

    const scheduleDisposal = (items: unknown[]): void => {
      tracker?.scheduleDisposal(items);
    };

    const cancelDisposal = (items: unknown[]): void => {
      tracker?.cancelDisposal(items);
    };

    const get = ((index?: number): T[] | T | undefined => {
      const arr = getArray();
      if (index === undefined) return arr;
      return arr[index];
    }) as FocusList<T>["get"];

    return {
      get,

      length(): number {
        return getArray().length;
      },

      isEmpty(): boolean {
        return getArray().length === 0;
      },

      first(): T | undefined {
        return getArray()[0];
      },

      last(): T | undefined {
        const arr = getArray();
        return arr[arr.length - 1];
      },

      push(...items: T[]): void {
        cancelDisposal(items);
        setter((draft) => {
          const arr = draft ?? [];
          arr.push(...items);
          return arr;
        });
      },

      unshift(...items: T[]): void {
        cancelDisposal(items);
        setter((draft) => {
          const arr = draft ?? [];
          arr.unshift(...items);
          return arr;
        });
      },

      pop(): T | undefined {
        // Capture from original array BEFORE mutation (avoids immer proxy issues)
        const currentArray = getArray();
        if (currentArray.length === 0) return undefined;
        const removed = currentArray[currentArray.length - 1];
        setter((draft) => {
          const arr = draft ?? [];
          arr.pop();
          return arr;
        });
        scheduleDisposal([removed]);
        return removed;
      },

      shift(): T | undefined {
        // Capture from original array BEFORE mutation
        const currentArray = getArray();
        if (currentArray.length === 0) return undefined;
        const removed = currentArray[0];
        setter((draft) => {
          const arr = draft ?? [];
          arr.shift();
          return arr;
        });
        scheduleDisposal([removed]);
        return removed;
      },

      remove(...items: T[]): number {
        // Find indices in original array BEFORE mutation
        const currentArray = getArray();
        const indicesToRemove: number[] = [];
        const removed: T[] = [];

        for (const item of items) {
          const index = currentArray.indexOf(item);
          if (index !== -1 && !indicesToRemove.includes(index)) {
            indicesToRemove.push(index);
            removed.push(item);
          }
        }

        if (removed.length === 0) return 0;

        // Sort descending so we splice from end first
        indicesToRemove.sort((a, b) => b - a);

        setter((draft) => {
          const arr = draft ?? [];
          for (const idx of indicesToRemove) {
            arr.splice(idx, 1);
          }
          return arr;
        });
        scheduleDisposal(removed);
        return removed.length;
      },

      removeAt(index: number): T | undefined {
        // Capture from original array BEFORE mutation
        const currentArray = getArray();
        if (index < 0 || index >= currentArray.length) return undefined;
        const removed = currentArray[index];
        setter((draft) => {
          const arr = draft ?? [];
          arr.splice(index, 1);
          return arr;
        });
        scheduleDisposal([removed]);
        return removed;
      },

      removeWhere(predicate: (item: T, index: number) => boolean): number {
        // Find matching items in original array BEFORE mutation
        const currentArray = getArray();
        const indicesToRemove: number[] = [];
        const removed: T[] = [];

        for (let i = 0; i < currentArray.length; i++) {
          if (predicate(currentArray[i], i)) {
            indicesToRemove.push(i);
            removed.push(currentArray[i]);
          }
        }

        if (removed.length === 0) return 0;

        // Sort descending so we splice from end first
        indicesToRemove.sort((a, b) => b - a);

        setter((draft) => {
          const arr = draft ?? [];
          for (const idx of indicesToRemove) {
            arr.splice(idx, 1);
          }
          return arr;
        });
        scheduleDisposal(removed);
        return removed.length;
      },

      insert(index: number, ...items: T[]): void {
        cancelDisposal(items);
        setter((draft) => {
          const arr = draft ?? [];
          arr.splice(index, 0, ...items);
          return arr;
        });
      },

      set(
        index: number,
        itemOrReducerOrUpdater: T | ((prev: T) => T | void)
      ): void {
        const isFunction = typeof itemOrReducerOrUpdater === "function";
        const currentArray = getArray();

        // If reducer/updater and item doesn't exist, do nothing
        if (isFunction && (index < 0 || index >= currentArray.length)) {
          return;
        }

        // Cancel disposal if setting a value that was pending disposal
        if (!isFunction) {
          cancelDisposal([itemOrReducerOrUpdater]);
        }

        // Capture old value from original array BEFORE mutation
        const old: T | undefined =
          index >= 0 && index < currentArray.length
            ? currentArray[index]
            : undefined;

        setter((draft) => {
          const arr = draft ?? [];

          if (isFunction) {
            const fn = itemOrReducerOrUpdater as (prev: T) => T | void;
            if (index >= 0 && index < arr.length) {
              const result = fn(arr[index]);
              // If function returns a value, it's a reducer; otherwise it's an updater
              if (result !== undefined) {
                arr[index] = result;
              }
              // For updater (void return), mutation already happened via immer
            }
          } else {
            arr[index] = itemOrReducerOrUpdater;
          }
          return arr;
        });
        // Only dispose if old value was replaced with a different value
        const newValue = getArray()[index];
        if (old !== undefined && old !== newValue) scheduleDisposal([old]);
      },

      clear(): void {
        const old = getArray();
        setter([]);
        scheduleDisposal(old);
      },

      replace(items: T[]): void {
        // Cancel disposal for items being re-added
        cancelDisposal(items);
        const old = getArray();
        setter(items);
        // Dispose items that were removed (not in new array)
        const toDispose = old.filter((item) => !items.includes(item));
        scheduleDisposal(toDispose);
      },

      find(predicate: (item: T, index: number) => boolean): T | undefined {
        return getArray().find(predicate);
      },

      findIndex(predicate: (item: T, index: number) => boolean): number {
        return getArray().findIndex(predicate);
      },

      includes(item: T): boolean {
        return getArray().includes(item);
      },

      map<U>(fn: (item: T, index: number) => U): U[] {
        return getArray().map(fn);
      },

      filter(predicate: (item: T, index: number) => boolean): T[] {
        return getArray().filter(predicate);
      },

      pick(equality) {
        return focus.pick(equality) ?? defaultValue;
      },
    };
  };
}

// =============================================================================
// MAP HELPER
// =============================================================================

/**
 * Options for the map helper.
 */
export interface MapOptions {
  /** Auto-dispose values when removed. Defaults to false */
  autoDispose?: boolean;
}

/**
 * Map API returned by the map() helper.
 */
export interface FocusMap<T> {
  /** Get the current record (returns defaultValue if undefined/null) */
  get(): Record<string, T>;
  /** Get value by key */
  at(key: string): T | undefined;
  /** Get number of entries */
  size(): number;
  /** Check if record is empty */
  isEmpty(): boolean;
  /** Check if key exists */
  has(key: string): boolean;
  /**
   * Set value at key (auto-disposes old value if enabled).
   * Accepts direct value, reducer, or immer-style updater.
   *
   * @example
   * cache.set('count', 10);                    // Direct value
   * cache.set('count', prev => prev + 1);      // Reducer (returns new value)
   * cache.set('user', draft => { draft.age++ }); // Updater (mutates draft)
   */
  set(key: string, valueOrReducerOrUpdater: T | ((prev: T) => T | void)): void;
  /** Delete key(s) (auto-disposes values if enabled) */
  delete(...keys: string[]): number;
  /** Delete keys matching predicate (auto-disposes values if enabled) */
  deleteWhere(predicate: (value: T, key: string) => boolean): number;
  /** Clear all entries (auto-disposes all values if enabled) */
  clear(): void;
  /** Replace entire record (auto-disposes old values if enabled) */
  replace(record: Record<string, T>): void;
  /** Get all keys */
  keys(): string[];
  /** Get all values */
  values(): T[];
  /** Get all entries */
  entries(): [string, T][];
  /** Create a pick selector for fine-grained reactivity */
  pick(
    equality?: PickEquality<Record<string, T> | undefined | null>
  ): Record<string, T>;
}

/**
 * Create a map helper for object/record focus.
 * Handles undefined/null records gracefully.
 *
 * @example
 * ```ts
 * const cacheStore = store({
 *   name: 'cache',
 *   state: { users: {} as Record<string, User> },
 *   setup({ focus }) {
 *     const users = focus('users').as(map());
 *     return {
 *       setUser: (id: string, user: User) => users.set(id, user),
 *       getUser: (id: string) => users.at(id),
 *       removeUser: (id: string) => users.delete(id),
 *       hasUser: (id: string) => users.has(id),
 *       clearUsers: () => users.clear(),
 *     };
 *   },
 * });
 * ```
 */
export function map<T>(
  options?: MapOptions
): (
  focus:
    | Focus<Record<string, T> | undefined | null>
    | Focus<Record<string, T> | undefined>
    | Focus<Record<string, T> | null>
    | Focus<Record<string, T>>
) => FocusMap<T> {
  const autoDispose = options?.autoDispose ?? false;
  const defaultValue: Record<string, T> = {};

  return (inputFocus) => {
    // Cast to nullable type for internal use (implementation handles undefined/null)
    const focus = inputFocus as Focus<Record<string, T> | undefined | null>;
    const [getter, setter] = focus;
    const tracker = autoDispose ? createDisposalTracker() : null;

    const getRecord = (): Record<string, T> => getter() ?? defaultValue;

    const scheduleDisposal = (items: unknown[]): void => {
      tracker?.scheduleDisposal(items);
    };

    const cancelDisposal = (items: unknown[]): void => {
      tracker?.cancelDisposal(items);
    };

    return {
      get: getRecord,

      at(key: string): T | undefined {
        return getRecord()[key];
      },

      size(): number {
        return Object.keys(getRecord()).length;
      },

      isEmpty(): boolean {
        return Object.keys(getRecord()).length === 0;
      },

      has(key: string): boolean {
        return key in getRecord();
      },

      set(
        key: string,
        valueOrReducerOrUpdater: T | ((prev: T) => T | void)
      ): void {
        const isFunction = typeof valueOrReducerOrUpdater === "function";
        const currentRecord = getRecord();

        // If reducer/updater and key doesn't exist, do nothing
        if (isFunction && !(key in currentRecord)) return;

        // Cancel disposal if setting a value that was pending disposal
        if (!isFunction) {
          cancelDisposal([valueOrReducerOrUpdater]);
        }

        // Capture old value from original record BEFORE mutation
        const old: T | undefined = currentRecord[key];

        setter((draft) => {
          const rec = draft ?? {};

          if (isFunction) {
            const fn = valueOrReducerOrUpdater as (prev: T) => T | void;
            const result = fn(rec[key]);
            // If function returns a value, it's a reducer; otherwise it's an updater
            if (result !== undefined) {
              rec[key] = result;
            }
            // For updater (void return), mutation already happened via immer
          } else {
            rec[key] = valueOrReducerOrUpdater;
          }
          return rec;
        });
        // Only dispose if old value was replaced with a different value
        const newValue = getRecord()[key];
        if (old !== undefined && old !== newValue) scheduleDisposal([old]);
      },

      delete(...keys: string[]): number {
        // Capture values from original record BEFORE mutation
        const currentRecord = getRecord();
        const removed: T[] = [];
        const keysToDelete: string[] = [];

        for (const key of keys) {
          if (key in currentRecord) {
            removed.push(currentRecord[key]);
            keysToDelete.push(key);
          }
        }

        if (removed.length === 0) return 0;

        setter((draft) => {
          const rec = draft ?? {};
          for (const key of keysToDelete) {
            delete rec[key];
          }
          return rec;
        });
        scheduleDisposal(removed);
        return removed.length;
      },

      deleteWhere(predicate: (value: T, key: string) => boolean): number {
        // Find matching entries in original record BEFORE mutation
        const currentRecord = getRecord();
        const removed: T[] = [];
        const keysToDelete: string[] = [];

        for (const key of Object.keys(currentRecord)) {
          if (predicate(currentRecord[key], key)) {
            removed.push(currentRecord[key]);
            keysToDelete.push(key);
          }
        }

        if (removed.length === 0) return 0;

        setter((draft) => {
          const rec = draft ?? {};
          for (const key of keysToDelete) {
            delete rec[key];
          }
          return rec;
        });
        scheduleDisposal(removed);
        return removed.length;
      },

      clear(): void {
        const old = Object.values(getRecord());
        setter({});
        scheduleDisposal(old);
      },

      replace(record: Record<string, T>): void {
        // Cancel disposal for values being re-added
        cancelDisposal(Object.values(record));
        const old = getRecord();
        setter(record);
        // Dispose values that were removed (not in new record)
        const newKeys = new Set(Object.keys(record));
        const toDispose = Object.entries(old)
          .filter(([key]) => !newKeys.has(key))
          .map(([, value]) => value);
        scheduleDisposal(toDispose);
      },

      keys(): string[] {
        return Object.keys(getRecord());
      },

      values(): T[] {
        return Object.values(getRecord());
      },

      entries(): [string, T][] {
        return Object.entries(getRecord());
      },

      pick(equality) {
        return focus.pick(equality) ?? defaultValue;
      },
    };
  };
}
