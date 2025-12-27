/**
 * Map Helper - Object/Record manipulation API for Focus.
 *
 * Provides a convenient map-like API with:
 * - Auto-disposal of removed values
 * - Group coordination for cross-collection moves
 * - Events for value additions/removals
 */

import type { Focus, PickEquality } from "../types";
import {
  createLocalDisposalTracker,
  normalizeAutoDispose,
  type DisposalGroup,
  type FocusAutoDispose,
} from "./disposalGroup";
import { batch } from "./tracking";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the map helper.
 */
export interface MapOptions<T> {
  /**
   * Auto-dispose values when removed.
   *
   * - `false` / `undefined`: No auto-disposal (default)
   * - `true`: Dispose immediately via microtask
   * - `number`: Grace period in ms (e.g., `100` = 100ms delay)
   * - `string`: Named disposal group (shared across collections)
   * - `DisposalGroup`: Direct group instance
   * - `{ group, gracePeriodMs }`: Full options
   *
   * @example
   * ```ts
   * // Simple auto-dispose
   * map({ autoDispose: true })
   *
   * // With 100ms grace period
   * map({ autoDispose: 100 })
   *
   * // Named group - values moving between maps with same group name won't be disposed
   * map({ autoDispose: "cache" })
   *
   * // Named group with grace period
   * map({ autoDispose: { group: "cache", gracePeriodMs: 100 } })
   *
   * // Direct group instance
   * const group = disposalGroup();
   * map({ autoDispose: group })
   * ```
   */
  autoDispose?: FocusAutoDispose;

  /**
   * Called when value is added to the map.
   */
  onAdded?: (value: T, key: string) => void;

  /**
   * Called when value is removed from the map.
   */
  onRemoved?: (value: T, key: string) => void;
}

/**
 * Map API returned by the map() helper.
 */
export interface FocusMap<T> {
  /** Get the current record (returns empty object if undefined/null) */
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

  /**
   * Ensure value exists at key, creating it if necessary.
   *
   * @example
   * const user = users.ensure('user-123', () => ({ id: 'user-123', name: 'New' }));
   */
  ensure(key: string, create: () => T): T;

  /**
   * Swap values at two keys.
   *
   * @example
   * cache.swap('a', 'b'); // Swap values at keys 'a' and 'b'
   */
  swap(keyA: string, keyB: string): void;

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

// =============================================================================
// IMPLEMENTATION
// =============================================================================

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
 *
 * @example
 * ```ts
 * // With named disposal group for cross-collection moves
 * const cacheStore = store({
 *   name: 'cache',
 *   state: {
 *     active: {} as Record<string, Session>,
 *     archived: {} as Record<string, Session>,
 *   },
 *   setup({ focus }) {
 *     // Same group name = values moving between won't be disposed
 *     const active = focus('active').as(map({ autoDispose: "sessions" }));
 *     const archived = focus('archived').as(map({ autoDispose: "sessions" }));
 *
 *     return {
 *       archiveSession: (id: string) => {
 *         const session = active.at(id);
 *         if (session) {
 *           active.delete(id);         // Schedules disposal
 *           archived.set(id, session); // Cancels disposal - same group!
 *         }
 *       },
 *     };
 *   },
 * });
 * ```
 */
export function map<T>(
  options?: MapOptions<T>
): (
  focus:
    | Focus<Record<string, T> | undefined | null>
    | Focus<Record<string, T> | undefined>
    | Focus<Record<string, T> | null>
    | Focus<Record<string, T>>
) => FocusMap<T> {
  const autoDisposeResult = normalizeAutoDispose(options?.autoDispose);
  const gracePeriodMs = autoDisposeResult ? autoDisposeResult.gracePeriodMs : 0;
  const group = autoDisposeResult ? autoDisposeResult.group : null;
  const onAdded = options?.onAdded;
  const onRemoved = options?.onRemoved;
  const defaultValue: Record<string, T> = {};

  return (inputFocus) => {
    // Cast to nullable type for internal use (implementation handles undefined/null)
    const focus = inputFocus as Focus<Record<string, T> | undefined | null>;
    const [getter, setter] = focus;

    // Use group if provided, otherwise create local tracker
    const tracker = autoDisposeResult
      ? group ?? createLocalDisposalTracker(gracePeriodMs)
      : null;

    const getRecord = (): Record<string, T> => getter() ?? defaultValue;

    const scheduleDisposal = (items: unknown[]): void => {
      if (!tracker) return;
      if ("flush" in tracker) {
        // DisposalGroup has flush method
        (tracker as DisposalGroup).scheduleDisposal(items, gracePeriodMs);
      } else {
        // Local tracker
        (
          tracker as ReturnType<typeof createLocalDisposalTracker>
        ).scheduleDisposal(items);
      }
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

        // Capture old value from original record BEFORE mutation
        const old: T | undefined = currentRecord[key];
        const hadKey = key in currentRecord;

        batch(() => {
          // Cancel disposal if setting a value that was pending disposal
          if (!isFunction) {
            cancelDisposal([valueOrReducerOrUpdater]);
          }

          setter((draft) => {
            const rec = draft ?? {};

            if (isFunction) {
              const fn = valueOrReducerOrUpdater as (prev: T) => T | void;
              const result = fn(rec[key]);
              if (result !== undefined) {
                rec[key] = result;
              }
            } else {
              rec[key] = valueOrReducerOrUpdater;
            }
            return rec;
          });

          const newValue = getRecord()[key];

          // Notify removed if old value was replaced with different value
          if (hadKey && old !== newValue) {
            scheduleDisposal([old]);
            onRemoved?.(old as T, key);
          }

          // Notify added for new key or replaced value
          if (!hadKey || old !== newValue) {
            onAdded?.(newValue, key);
          }
        });
      },

      ensure(key: string, create: () => T): T {
        const currentRecord = getRecord();
        if (key in currentRecord) {
          return currentRecord[key];
        }

        const value = create();
        batch(() => {
          cancelDisposal([value]);

          setter((draft) => {
            const rec = draft ?? {};
            rec[key] = value;
            return rec;
          });

          onAdded?.(value, key);
        });
        return value;
      },

      swap(keyA: string, keyB: string): void {
        if (keyA === keyB) return;
        const currentRecord = getRecord();
        if (!(keyA in currentRecord) || !(keyB in currentRecord)) return;

        setter((draft) => {
          const rec = draft ?? {};
          const temp = rec[keyA];
          rec[keyA] = rec[keyB];
          rec[keyB] = temp;
          return rec;
        });
      },

      delete(...keys: string[]): number {
        const currentRecord = getRecord();
        const removed: Array<{ value: T; key: string }> = [];

        for (const key of keys) {
          if (key in currentRecord) {
            removed.push({ value: currentRecord[key], key });
          }
        }

        if (removed.length === 0) return 0;

        batch(() => {
          setter((draft) => {
            const rec = draft ?? {};
            for (const { key } of removed) {
              delete rec[key];
            }
            return rec;
          });

          scheduleDisposal(removed.map((r) => r.value));
          removed.forEach(({ value, key }) => onRemoved?.(value, key));
        });
        return removed.length;
      },

      deleteWhere(predicate: (value: T, key: string) => boolean): number {
        const currentRecord = getRecord();
        const removed: Array<{ value: T; key: string }> = [];

        for (const key of Object.keys(currentRecord)) {
          if (predicate(currentRecord[key], key)) {
            removed.push({ value: currentRecord[key], key });
          }
        }

        if (removed.length === 0) return 0;

        batch(() => {
          setter((draft) => {
            const rec = draft ?? {};
            for (const { key } of removed) {
              delete rec[key];
            }
            return rec;
          });

          scheduleDisposal(removed.map((r) => r.value));
          removed.forEach(({ value, key }) => onRemoved?.(value, key));
        });
        return removed.length;
      },

      clear(): void {
        const old = getRecord();
        const entries = Object.entries(old);
        if (entries.length === 0) return;
        batch(() => {
          setter({});
          scheduleDisposal(Object.values(old));
          entries.forEach(([key, value]) => onRemoved?.(value, key));
        });
      },

      replace(record: Record<string, T>): void {
        const old = getRecord();
        batch(() => {
          cancelDisposal(Object.values(record));
          setter(record);

          // Dispose values that were removed (not in new record)
          const newKeys = new Set(Object.keys(record));
          const toDispose = Object.entries(old).filter(
            ([key]) => !newKeys.has(key)
          );
          scheduleDisposal(toDispose.map(([, value]) => value));
          toDispose.forEach(([key, value]) => onRemoved?.(value, key));

          // Notify for new keys
          const oldKeys = new Set(Object.keys(old));
          Object.entries(record).forEach(([key, value]) => {
            if (!oldKeys.has(key) || old[key] !== value) {
              onAdded?.(value, key);
            }
          });
        });
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

// Re-export for convenience
export {
  disposalGroup,
  getNamedGroup,
  type DisposalGroup,
  type FocusAutoDispose,
  type FocusAutoDisposeOptions,
} from "./disposalGroup";
