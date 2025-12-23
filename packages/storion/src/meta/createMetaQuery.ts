import { AllMetaInfo, AnyFunc, MetaEntry, MetaInfo, MetaQuery } from "../types";

/**
 * Creates a MetaQuery object for querying store metadata.
 *
 * @param entries - Array of MetaEntry objects from store options
 * @returns MetaQuery interface with single/all/any methods
 */
export function createMetaQuery(
  entries: undefined | MetaEntry | MetaEntry[]
): MetaQuery {
  const entryArray = Array.isArray(entries)
    ? entries
    : entries
    ? [entries]
    : [];
  // Single/default strategy: returns first value
  const single = <TValue>(type: AnyFunc): MetaInfo<any, TValue> => {
    const result: {
      store: TValue | undefined;
      fields: Record<string, TValue | undefined>;
    } = { store: undefined, fields: {} };

    for (const entry of entryArray) {
      if (entry.type !== type) continue;

      if (entry.fields && entry.fields.length > 0) {
        // Field-level: iterate over all fields in the entry
        for (const field of entry.fields) {
          const fieldKey = field as string;
          // Only set if not already set (first wins)
          if (!(fieldKey in result.fields)) {
            result.fields[fieldKey] = entry.value as TValue;
          }
        }
      } else {
        // Store-level: fields is undefined or empty
        // Only set if not already set (first wins)
        if (result.store === undefined) {
          result.store = entry.value as TValue;
        }
      }
    }

    return result as MetaInfo<any, TValue>;
  };

  // All strategy: returns arrays of all values
  const all = <TValue>(type: AnyFunc): AllMetaInfo<any, TValue> => {
    const result: {
      store: TValue[];
      fields: Record<string, TValue[]>;
    } = { store: [], fields: {} };

    for (const entry of entryArray) {
      if (entry.type !== type) continue;

      if (entry.fields && entry.fields.length > 0) {
        // Field-level: iterate over all fields in the entry
        for (const field of entry.fields) {
          const fieldKey = field as string;
          let arr = result.fields[fieldKey];
          if (!arr) {
            arr = [];
            result.fields[fieldKey] = arr;
          }
          arr.push(entry.value as TValue);
        }
      } else {
        // Store-level
        result.store.push(entry.value as TValue);
      }
    }

    return result as unknown as AllMetaInfo<any, TValue>;
  };

  /**
   * Get all field names that have the specified meta type.
   * Optionally filter by a predicate on the meta value.
   *
   * @param type - The meta type to query
   * @param predicate - Optional filter function for the meta value
   * @returns Array of field names that have the meta type
   */
  const fields = <TValue>(
    type: AnyFunc,
    predicate?: (value: TValue) => boolean
  ): string[] => {
    const result = new Set<string>();
    for (const entry of entryArray) {
      if (entry.type !== type) continue;
      if (entry.fields && entry.fields.length > 0) {
        if (!predicate || predicate(entry.value as TValue)) {
          // Add all fields from the entry, not just the first one
          for (const field of entry.fields) {
            result.add(field as string);
          }
        }
      }
    }
    return Array.from(result);
  };

  // Any check: returns true if any type matches
  const any = (...types: AnyFunc[]): boolean => {
    return entryArray.some((entry) => types.includes(entry.type));
  };

  // Create the MetaQuery object
  // Default call uses single strategy
  const query = Object.assign(
    <TValue>(type: AnyFunc): MetaInfo<any, TValue> =>
      single(type) as MetaInfo<any, TValue>,
    { all, any, fields }
  );

  return query;
}
