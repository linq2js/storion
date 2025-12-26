/**
 * List Helper - Array manipulation API for Focus.
 *
 * Provides a convenient array-like API with:
 * - Auto-disposal of removed items
 * - Group coordination for cross-collection moves
 * - Events for item additions/removals
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
 * Options for the list helper.
 */
export interface ListOptions<T> {
  /**
   * Auto-dispose items when removed.
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
   * list({ autoDispose: true })
   *
   * // With 100ms grace period
   * list({ autoDispose: 100 })
   *
   * // Named group - items moving between lists with same group name won't be disposed
   * list({ autoDispose: "todos" })
   *
   * // Named group with grace period
   * list({ autoDispose: { group: "todos", gracePeriodMs: 100 } })
   *
   * // Direct group instance
   * const group = disposalGroup();
   * list({ autoDispose: group })
   * ```
   */
  autoDispose?: FocusAutoDispose;

  /**
   * Called when item(s) are added to the list.
   */
  onAdded?: (item: T, index: number) => void;

  /**
   * Called when item(s) are removed from the list.
   */
  onRemoved?: (item: T, index: number) => void;
}

/**
 * List API returned by the list() helper.
 */
export interface FocusList<T> {
  /** Get the current array (returns empty array if undefined/null) */
  get(): T[];

  /** Get item at index */
  at(index: number): T | undefined;

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

  /**
   * Get item at index, or create it if it doesn't exist.
   *
   * @example
   * const item = items.tryGet(5, () => ({ id: 5, name: 'New' }));
   */
  tryGet(index: number, create: () => T): T;

  /**
   * Swap items at two indices.
   *
   * @example
   * items.swap(0, 2); // Swap first and third items
   */
  swap(indexA: number, indexB: number): void;

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

// =============================================================================
// IMPLEMENTATION
// =============================================================================

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
 *
 * @example
 * ```ts
 * // With named disposal group for cross-collection moves
 * const todoStore = store({
 *   name: 'todos',
 *   state: {
 *     active: [] as TodoItem[],
 *     completed: [] as TodoItem[],
 *   },
 *   setup({ focus }) {
 *     // Same group name = items moving between won't be disposed
 *     const active = focus('active').as(list({ autoDispose: "todos" }));
 *     const completed = focus('completed').as(list({ autoDispose: "todos" }));
 *
 *     return {
 *       complete: (todo: TodoItem) => {
 *         active.remove(todo);      // Schedules disposal
 *         completed.push(todo);     // Cancels disposal - same group!
 *       },
 *     };
 *   },
 * });
 * ```
 */
export function list<T>(
  options?: ListOptions<T>
): (
  focus:
    | Focus<T[] | undefined | null>
    | Focus<T[] | undefined>
    | Focus<T[] | null>
    | Focus<T[]>
) => FocusList<T> {
  const autoDisposeResult = normalizeAutoDispose(options?.autoDispose);
  const gracePeriodMs = autoDisposeResult ? autoDisposeResult.gracePeriodMs : 0;
  const group = autoDisposeResult ? autoDisposeResult.group : null;
  const onAdded = options?.onAdded;
  const onRemoved = options?.onRemoved;

  return (inputFocus) => {
    // Cast to nullable type for internal use (implementation handles undefined/null)
    const focus = inputFocus as Focus<T[] | undefined | null>;
    const [getter, setter] = focus;
    const defaultValue: T[] = [];

    // Use group if provided, otherwise create local tracker
    const tracker = autoDisposeResult
      ? group ?? createLocalDisposalTracker(gracePeriodMs)
      : null;

    const getArray = (): T[] => getter() ?? defaultValue;

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

    const notifyAdded = (items: T[], startIndex: number): void => {
      if (!onAdded) return;
      items.forEach((item, i) => onAdded(item, startIndex + i));
    };

    const notifyRemoved = (items: T[], indices: number[]): void => {
      if (!onRemoved) return;
      items.forEach((item, i) => onRemoved(item, indices[i]));
    };

    return {
      get(): T[] {
        return getArray();
      },

      at(index: number): T | undefined {
        return getArray()[index];
      },

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
        if (items.length === 0) return;
        batch(() => {
          cancelDisposal(items);
          const startIndex = getArray().length;
          setter((draft) => {
            const arr = draft ?? [];
            arr.push(...items);
            return arr;
          });
          notifyAdded(items, startIndex);
        });
      },

      unshift(...items: T[]): void {
        if (items.length === 0) return;
        batch(() => {
          cancelDisposal(items);
          setter((draft) => {
            const arr = draft ?? [];
            arr.unshift(...items);
            return arr;
          });
          notifyAdded(items, 0);
        });
      },

      pop(): T | undefined {
        const currentArray = getArray();
        if (currentArray.length === 0) return undefined;
        const index = currentArray.length - 1;
        const removed = currentArray[index];
        batch(() => {
          setter((draft) => {
            const arr = draft ?? [];
            arr.pop();
            return arr;
          });
          scheduleDisposal([removed]);
          notifyRemoved([removed], [index]);
        });
        return removed;
      },

      shift(): T | undefined {
        const currentArray = getArray();
        if (currentArray.length === 0) return undefined;
        const removed = currentArray[0];
        batch(() => {
          setter((draft) => {
            const arr = draft ?? [];
            arr.shift();
            return arr;
          });
          scheduleDisposal([removed]);
          notifyRemoved([removed], [0]);
        });
        return removed;
      },

      remove(...items: T[]): number {
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
        const sortedIndices = [...indicesToRemove].sort((a, b) => b - a);

        batch(() => {
          setter((draft) => {
            const arr = draft ?? [];
            for (const idx of sortedIndices) {
              arr.splice(idx, 1);
            }
            return arr;
          });
          scheduleDisposal(removed);
          notifyRemoved(removed, indicesToRemove);
        });
        return removed.length;
      },

      removeAt(index: number): T | undefined {
        const currentArray = getArray();
        if (index < 0 || index >= currentArray.length) return undefined;
        const removed = currentArray[index];
        batch(() => {
          setter((draft) => {
            const arr = draft ?? [];
            arr.splice(index, 1);
            return arr;
          });
          scheduleDisposal([removed]);
          notifyRemoved([removed], [index]);
        });
        return removed;
      },

      removeWhere(predicate: (item: T, index: number) => boolean): number {
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
        const sortedIndices = [...indicesToRemove].sort((a, b) => b - a);

        batch(() => {
          setter((draft) => {
            const arr = draft ?? [];
            for (const idx of sortedIndices) {
              arr.splice(idx, 1);
            }
            return arr;
          });
          scheduleDisposal(removed);
          notifyRemoved(removed, indicesToRemove);
        });
        return removed.length;
      },

      insert(index: number, ...items: T[]): void {
        if (items.length === 0) return;
        batch(() => {
          cancelDisposal(items);
          setter((draft) => {
            const arr = draft ?? [];
            arr.splice(index, 0, ...items);
            return arr;
          });
          notifyAdded(items, index);
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

        // Capture old value from original array BEFORE mutation
        const old: T | undefined =
          index >= 0 && index < currentArray.length
            ? currentArray[index]
            : undefined;

        batch(() => {
          // Cancel disposal if setting a value that was pending disposal
          if (!isFunction) {
            cancelDisposal([itemOrReducerOrUpdater]);
          }

          setter((draft) => {
            const arr = draft ?? [];

            if (isFunction) {
              const fn = itemOrReducerOrUpdater as (prev: T) => T | void;
              if (index >= 0 && index < arr.length) {
                const result = fn(arr[index]);
                if (result !== undefined) {
                  arr[index] = result;
                }
              }
            } else {
              arr[index] = itemOrReducerOrUpdater;
            }
            return arr;
          });

          const newValue = getArray()[index];
          if (old !== undefined && old !== newValue) {
            scheduleDisposal([old]);
            notifyRemoved([old], [index]);
            notifyAdded([newValue], index);
          }
        });
      },

      tryGet(index: number, create: () => T): T {
        const currentArray = getArray();
        if (index >= 0 && index < currentArray.length) {
          return currentArray[index];
        }

        const item = create();
        batch(() => {
          cancelDisposal([item]);

          setter((draft) => {
            const arr = draft ?? [];
            // Ensure array is long enough
            while (arr.length <= index) {
              arr.push(undefined as T);
            }
            arr[index] = item;
            return arr;
          });

          notifyAdded([item], index);
        });
        return item;
      },

      swap(indexA: number, indexB: number): void {
        if (indexA === indexB) return;
        const currentArray = getArray();
        if (
          indexA < 0 ||
          indexA >= currentArray.length ||
          indexB < 0 ||
          indexB >= currentArray.length
        ) {
          return;
        }

        setter((draft) => {
          const arr = draft ?? [];
          const temp = arr[indexA];
          arr[indexA] = arr[indexB];
          arr[indexB] = temp;
          return arr;
        });
      },

      clear(): void {
        const old = getArray();
        if (old.length === 0) return;
        const indices = old.map((_, i) => i);
        batch(() => {
          setter([]);
          scheduleDisposal(old);
          notifyRemoved(old, indices);
        });
      },

      replace(items: T[]): void {
        const old = getArray();
        batch(() => {
          cancelDisposal(items);
          setter(items);

          // Dispose items that were removed (not in new array)
          const toDispose = old.filter((item) => !items.includes(item));
          const removedIndices = toDispose.map((item) => old.indexOf(item));
          scheduleDisposal(toDispose);
          notifyRemoved(toDispose, removedIndices);

          // Notify for new items
          const newItems = items.filter((item) => !old.includes(item));
          const addedIndices = newItems.map((item) => items.indexOf(item));
          newItems.forEach((item, i) => onAdded?.(item, addedIndices[i]));
        });
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

// Re-export for convenience
export {
  disposalGroup,
  getNamedGroup,
  type DisposalGroup,
  type FocusAutoDispose,
  type FocusAutoDisposeOptions,
} from "./disposalGroup";
