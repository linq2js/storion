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

      if (entry.field) {
        const fieldKey = entry.field as string;
        // Only set if not already set (first wins)
        if (!(fieldKey in result.fields)) {
          result.fields[fieldKey] = entry.value as TValue;
        }
      } else {
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

      if (entry.field) {
        const fieldKey = entry.field as string;
        let arr = result.fields[fieldKey];
        if (!arr) {
          arr = [];
          result.fields[fieldKey] = arr;
        }
        arr.push(entry.value as TValue);
      } else {
        result.store.push(entry.value as TValue);
      }
    }

    return result as unknown as AllMetaInfo<any, TValue>;
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
    { single, all, any }
  );

  return query;
}
