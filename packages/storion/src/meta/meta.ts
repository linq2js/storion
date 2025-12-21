import type { MetaType, MetaEntry, AnyFunc } from "../types";

/**
 * Create a metadata builder for decorating stores with custom metadata.
 *
 * Meta allows libraries and users to attach arbitrary typed metadata to:
 * - Store level: `myMeta()` or `myMeta(value)` - applies to the entire store
 * - Field level: `myMeta.for("fieldName")` or `myMeta.for("fieldName", value)` - applies to specific field
 *
 * ## Overloads
 *
 * ### 1. `meta()` - Boolean flag meta
 * Creates a meta type where calling `myMeta()` returns `MetaEntry<any, true>`
 * ```ts
 * const persist = meta();
 * persist()              // MetaEntry with value: true
 * persist.for("field")   // MetaEntry with value: true for field
 * ```
 *
 * ### 2. `meta<TValue>()` - Typed value meta (requires value argument)
 * Creates a meta type where calling `myMeta(value)` returns `MetaEntry<any, TValue>`
 * ```ts
 * const priority = meta<number>();
 * priority(1)              // MetaEntry with value: 1
 * priority.for("field", 5) // MetaEntry with value: 5 for field
 * ```
 *
 * ### 3. `meta(builder)` - Custom builder meta
 * Creates a meta type with custom value transformation
 * ```ts
 * const config = meta((name: string, value: number) => ({ name, value }));
 * config("timeout", 5000)  // MetaEntry with value: { name: "timeout", value: 5000 }
 * ```
 *
 * @example Boolean flag meta
 * ```ts
 * const persist = meta();
 *
 * const userStore = store({
 *   state: { name: "" },
 *   meta: [persist()],
 * });
 *
 * ctx.meta(persist).store;  // true
 * ```
 *
 * @example Typed value meta
 * ```ts
 * const priority = meta<number>();
 *
 * const criticalStore = store({
 *   state: { data: null },
 *   meta: [priority(1)],
 * });
 *
 * ctx.meta(priority).store;  // 1
 * ```
 *
 * @example Field-level meta
 * ```ts
 * const validate = meta<string>();
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
 * @param builder - Optional function to transform arguments into meta value.
 *                  If omitted with no type param, meta value is `true`.
 *                  If omitted with type param, first argument is returned as value.
 * @returns A MetaType that creates MetaEntry objects
 */
export function meta(): MetaType<any, [], true>;
export function meta<TValue>(): MetaType<any, [value: TValue], TValue>;
export function meta<TValue, TArgs extends any[]>(
  builder: (...args: TArgs) => TValue
): MetaType<any, TArgs, TValue>;
export function meta<TValue, TArgs extends any[]>(
  builder?: (...args: TArgs) => TValue
): MetaType<any, TArgs, TValue> {
  if (!builder) {
    builder = ((...args: any[]) => (args.length ? args[0] : true)) as AnyFunc;
  }

  // Create the MetaType first so we can reference it in entries
  const metaType: MetaType<any, TArgs, TValue> = Object.assign(
    // Store-level meta: myMeta(...args)
    (...args: TArgs): MetaEntry<undefined, TValue> => {
      return {
        fields: undefined,
        value: builder?.(...args) ?? (true as TValue),
        type: metaType, // reference the MetaType itself
      };
    },
    {
      // Field-level meta: myMeta.for("fieldName", ...args) or myMeta.for(["f1", "f2"], ...args)
      for<TField>(
        fieldOrFields: TField | TField[],
        ...args: TArgs
      ): MetaEntry<TField, TValue> {
        const fields = Array.isArray(fieldOrFields)
          ? fieldOrFields
          : [fieldOrFields];
        return {
          fields,
          value: builder?.(...args) ?? (true as TValue),
          type: metaType, // reference the MetaType itself
        };
      },
    }
  );

  return metaType;
}
