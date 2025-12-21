import type { MetaType, MetaEntry } from "../types";

/**
 * Create a metadata builder for decorating stores with custom metadata.
 *
 * Meta allows libraries and users to attach arbitrary typed metadata to:
 * - Store level: `myMeta(value)` - applies to the entire store
 * - Field level: `myMeta.for("fieldName", value)` - applies to specific state field
 *
 * Retrieve meta via `ctx.meta(type)` which returns first value (default),
 * or use `ctx.meta.all(type)` for all values.
 *
 * @example Store-level meta (boolean flag)
 * ```ts
 * const persist = meta();
 *
 * const userStore = store({
 *   state: { name: "" },
 *   meta: [persist()],
 * });
 *
 * ctx.meta(persist).store;           // true (first value)
 * ctx.meta.all(persist).store;       // [true] (all values)
 * ```
 *
 * @example Store-level meta (with value)
 * ```ts
 * const priority = meta((level: number) => level);
 *
 * const criticalStore = store({
 *   state: { data: null },
 *   meta: [priority(1), priority(2)],
 * });
 *
 * ctx.meta(priority).store;           // 1 (first)
 * ctx.meta.all(priority).store;       // [1, 2] (all)
 * ```
 *
 * @example Field-level meta
 * ```ts
 * const validate = meta((rule: string) => rule);
 *
 * const formStore = store({
 *   state: { email: "", age: 0 },
 *   meta: [
 *     validate.for("email", "email-format"),
 *     validate.for("age", "positive-number"),
 *   ],
 * });
 *
 * formStore.meta(validate).fields.email;  // "email-format"
 * formStore.meta(validate).fields.age;    // "positive-number"
 * ```
 *
 * @example Check meta existence
 * ```ts
 * const persist = meta();
 * const sync = meta();
 *
 * userStore.meta.any(persist);        // true
 * userStore.meta.any(sync);           // false
 * userStore.meta.any(persist, sync);  // true (has at least one)
 * ```
 *
 * @param builder - Optional function to transform arguments into meta value.
 *                  If omitted, meta value defaults to `true`.
 * @returns A MetaType that creates MetaEntry objects
 */
export function meta(): MetaType<any, [], true>;
export function meta<TValue, TArgs extends any[]>(
  builder: (...args: TArgs) => TValue
): MetaType<any, TArgs, TValue>;
export function meta<TValue, TArgs extends any[]>(
  builder?: (...args: TArgs) => TValue
): MetaType<any, TArgs, TValue> {
  // Create the MetaType first so we can reference it in entries
  const metaType: MetaType<any, TArgs, TValue> = Object.assign(
    // Store-level meta: myMeta(...args)
    <TField>(...args: TArgs): MetaEntry<TField, TValue> => {
      return {
        field: undefined,
        value: builder?.(...args) ?? (true as TValue),
        type: metaType, // reference the MetaType itself
      };
    },
    {
      // Field-level meta: myMeta.for("fieldName", ...args)
      for<TField>(field: TField, ...args: TArgs): MetaEntry<TField, TValue> {
        return {
          field,
          value: builder?.(...args) ?? (true as TValue),
          type: metaType, // reference the MetaType itself
        };
      },
    }
  );

  return metaType;
}
