/**
 * Lazy-instantiation Map wrapper.
 *
 * Creates items on first access via `get()`. Useful for managing
 * collections where items should be created on-demand.
 *
 * @example
 * ```ts
 * // Create a collection of emitters, one per property key
 * const emitters = collection((key: string) => emitter<void>());
 *
 * // First access creates the emitter
 * const countEmitter = emitters.get("count"); // creates new emitter
 * const countEmitter2 = emitters.get("count"); // returns same emitter
 * ```
 *
 * @param createItem - Factory function to create new items
 * @param initialItems - Optional initial entries
 * @returns A Map-like object with lazy instantiation on `get()`
 */
export function collection<TKey, TValue>(
  createItem: (key: TKey) => TValue,
  initialItems?: readonly [TKey, TValue][]
) {
  const map = new Map<TKey, TValue>(initialItems ?? []);

  return {
    with(key: TKey, callback: (item: TValue) => void) {
      if (map.has(key)) {
        callback(map.get(key)!);
      }
      return this;
    },

    /** Check if key exists (does NOT create item) */
    has(key: TKey) {
      return map.has(key);
    },

    /** Get item by key, creating it if it doesn't exist */
    get(key: TKey) {
      if (!map.has(key)) {
        map.set(key, createItem(key));
      }
      return map.get(key)!;
    },

    /** Explicitly set an item */
    set(key: TKey, value: TValue) {
      map.set(key, value);
      return this;
    },

    /** Number of items in the collection */
    get size() {
      return map.size;
    },

    /** Remove all items */
    clear() {
      map.clear();
      return this;
    },

    /** Remove a specific item */
    delete(key: TKey) {
      map.delete(key);
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
  };
}
