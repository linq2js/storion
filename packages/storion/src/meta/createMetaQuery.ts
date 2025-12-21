import {
  AnyFunc,
  MetaEntry,
  MetaInfo,
  MetaQuery,
  MultipleMetaInfo,
  SingleMetaInfo,
} from "../types";

/**
 * Creates a MetaQuery object for querying store metadata.
 *
 * @param entries - Array of MetaEntry objects from store options
 * @returns MetaQuery interface with single/multiple/any methods
 */
export function createMetaQuery<TField>(
  entries: MetaEntry[]
): MetaQuery<TField> {
  // Single/default strategy: returns first value
  const single = <TValue>(
    type: AnyFunc
  ): SingleMetaInfo<TField & string, TValue> => {
    const result: {
      store: TValue | undefined;
      fields: Record<string, TValue | undefined>;
    } = { store: undefined, fields: {} };

    for (const entry of entries) {
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

    return result as SingleMetaInfo<TField & string, TValue>;
  };

  // Multiple strategy: returns arrays
  const multiple = <TValue>(
    type: AnyFunc
  ): MultipleMetaInfo<TField & string, TValue> => {
    const result: {
      store: TValue[];
      fields: Record<string, TValue[]>;
    } = { store: [], fields: {} };

    for (const entry of entries) {
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

    return result as unknown as MultipleMetaInfo<TField & string, TValue>;
  };

  // Any check: returns true if any type matches
  const any = (...types: AnyFunc[]): boolean => {
    return entries.some((entry) => types.includes(entry.type));
  };

  // Create the MetaQuery object
  // Default call uses single strategy
  const query = Object.assign(
    <TValue>(type: AnyFunc): MetaInfo<TField & string, TValue> =>
      single(type) as MetaInfo<TField & string, TValue>,
    { single, multiple, any }
  );

  return query as MetaQuery<TField>;
}
