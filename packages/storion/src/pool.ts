import { tryDispose } from "./core/disposable";
import { resolveEquality } from "./core/equality";
import { AutoDisposeOptions, Equality } from "./types";

/**
 * A lazy-instantiation Map with factory function.
 * Items are created on-demand via `get()`.
 */
export interface Pool<TKey, TValue> {
  (key: TKey): TValue;
  /** Call callback if key exists (does NOT create item). Chainable. */
  tap(key: TKey, callback: (item: TValue) => void): this;
  /** Check if key exists (does NOT create item). */
  has(key: TKey): boolean;
  /** Get item by key, creating it via factory if it doesn't exist. */
  get(key: TKey): TValue;
  /** Explicitly set an item. Chainable. */
  set(key: TKey, value: TValue): this;
  /** Number of items in the pool. */
  size(): number;
  /** Remove all items. Calls dispose if autoDispose enabled. Chainable. */
  clear(): this;
  /** Remove item by key. Calls dispose if autoDispose enabled. Chainable. */
  delete(key: TKey): this;
  /** Iterate over keys. */
  keys(): IterableIterator<TKey>;
  /** Iterate over values. */
  values(): IterableIterator<TValue>;
  /** Iterate over [key, value] pairs. */
  entries(): IterableIterator<[TKey, TValue]>;
}

export interface PoolOptions<TKey, TValue> {
  initial?: readonly [TKey, TValue][];
  /**
   * Custom equality function for keys (O(n) lookup).
   * For better performance, use `keyOf` instead.
   */
  equality?: Equality<TKey>;
  /**
   * Hash function to normalize keys (O(1) lookup).
   * Converts complex keys to a hashable string/number.
   *
   * @example
   * ```ts
   * // Object keys hashed by id
   * pool(createUser, { keyOf: (user) => user.id })
   *
   * // Array keys hashed by JSON
   * pool(createItem, { keyOf: JSON.stringify })
   * ```
   */
  keyOf?: (key: TKey) => string | number;

  /**
   * Automatically call dispose method of the item when it is removed from the pool.
   */
  autoDispose?: AutoDisposeOptions | boolean;
}

/**
 * Lazy-instantiation Map wrapper.
 *
 * Creates items on first access via `get()`. Useful for managing
 * pools where items should be created on-demand.
 *
 * @example
 * ```ts
 * // Create a pool of emitters, one per property key
 * const emitters = pool((key: string) => emitter<void>());
 *
 * // First access creates the emitter
 * const countEmitter = emitters.get("count"); // creates new emitter
 * const countEmitter2 = emitters.get("count"); // returns same emitter
 * ```
 *
 * @param createItem - Factory function to create new items
 * @param optionsOrInitial - Optional options or initial entries
 * @returns A Map-like object with lazy instantiation on `get()`
 */
export function pool<TValue, TKey = unknown>(
  createItem: (key: TKey) => TValue,
  optionsOrInitial?: PoolOptions<TKey, TValue> | readonly [TKey, TValue][]
): Pool<TKey, TValue> {
  // Support both: options object OR initial array directly
  const isOptionsObject =
    optionsOrInitial &&
    !Array.isArray(optionsOrInitial) &&
    typeof optionsOrInitial === "object";
  const options = isOptionsObject
    ? (optionsOrInitial as PoolOptions<TKey, TValue>)
    : undefined;
  const initial = isOptionsObject
    ? options?.initial
    : (optionsOrInitial as readonly [TKey, TValue][] | undefined);

  const keyOf = options?.keyOf;
  const keyEquality =
    options?.equality && !keyOf ? resolveEquality(options.equality) : null;
  const shouldAutoDispose = !!options?.autoDispose;

  // Fast path: keyOf provides O(1) lookups via hash
  if (keyOf) {
    // Store: hash -> { key, value }
    const map = new Map<string | number, { key: TKey; value: TValue }>();

    // Initialize
    for (const [k, v] of initial ?? []) {
      map.set(keyOf(k), { key: k, value: v });
    }

    const get = (key: TKey) => {
      const hash = keyOf(key);
      const entry = map.get(hash);
      if (entry) return entry.value;
      const value = createItem(key);
      map.set(hash, { key, value });
      return value;
    };

    return Object.assign(get, {
      tap(key: TKey, callback: (item: TValue) => void) {
        const entry = map.get(keyOf(key));
        if (entry) callback(entry.value);
        return this;
      },
      has: (key: TKey) => map.has(keyOf(key)),
      get,
      set(key: TKey, value: TValue) {
        const hash = keyOf(key);
        if (shouldAutoDispose) {
          const existing = map.get(hash);
          if (existing && existing.value !== value) {
            tryDispose(existing.value);
          }
        }
        map.set(hash, { key, value });
        return this;
      },
      size() {
        return map.size;
      },
      clear() {
        if (shouldAutoDispose) {
          for (const entry of map.values()) {
            tryDispose(entry.value);
          }
        }
        map.clear();
        return this;
      },
      delete(key: TKey) {
        const hash = keyOf(key);
        if (shouldAutoDispose) {
          const entry = map.get(hash);
          if (entry) tryDispose(entry.value);
        }
        map.delete(hash);
        return this;
      },
      *keys() {
        for (const entry of map.values()) yield entry.key;
      },
      *values() {
        for (const entry of map.values()) yield entry.value;
      },
      *entries() {
        for (const entry of map.values())
          yield [entry.key, entry.value] as [TKey, TValue];
      },
    }) as Pool<TKey, TValue>;
  }

  // Standard path: direct key storage
  const map = new Map<TKey, TValue>(initial ?? []);

  // Find existing key via custom equality (O(n)) or direct lookup (O(1))
  const findKey = (key: TKey): TKey | undefined => {
    if (!keyEquality) return map.has(key) ? key : undefined;
    for (const k of map.keys()) {
      if (keyEquality(k, key)) return k;
    }
    return undefined;
  };

  /** Get item by key, creating it if it doesn't exist */
  const get = (key: TKey) => {
    const existingKey = findKey(key);
    if (existingKey !== undefined) {
      return map.get(existingKey)!;
    }
    const value = createItem(key);
    map.set(key, value);
    return value;
  };

  return Object.assign(get, {
    tap(key: TKey, callback: (item: TValue) => void) {
      const existingKey = findKey(key);
      if (existingKey !== undefined) {
        callback(map.get(existingKey)!);
      }
      return this;
    },

    /** Check if key exists (does NOT create item) */
    has(key: TKey) {
      return findKey(key) !== undefined;
    },

    get,

    /** Explicitly set an item */
    set(key: TKey, value: TValue) {
      const existingKey = findKey(key);
      if (existingKey !== undefined) {
        if (shouldAutoDispose) {
          const existing = map.get(existingKey);
          if (existing !== value) {
            tryDispose(existing);
          }
        }
        map.set(existingKey, value);
      } else {
        map.set(key, value);
      }
      return this;
    },

    /** Number of items in the pool */
    size() {
      return map.size;
    },

    /** Remove all items */
    clear() {
      if (shouldAutoDispose) {
        for (const value of map.values()) {
          tryDispose(value);
        }
      }
      map.clear();
      return this;
    },

    /** Remove a specific item */
    delete(key: TKey) {
      const existingKey = findKey(key);
      if (existingKey !== undefined) {
        if (shouldAutoDispose) {
          tryDispose(map.get(existingKey));
        }
        map.delete(existingKey);
      }
      return this;
    },

    /** Iterate over keys */
    keys() {
      return map.keys();
    },

    /** Iterate over values */
    values() {
      return map.values();
    },

    /** Iterate over [key, value] pairs */
    entries() {
      return map.entries();
    },
  }) as Pool<TKey, TValue>;
}
