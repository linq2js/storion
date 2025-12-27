import { Prettify } from "../types";

export type Mixin<TResult = any, TContext = any> = (
  context: TContext
) => TResult;

/**
 * Map of named mixins where each key maps to a mixin function.
 *
 * @example
 * ```ts
 * const mixins: MixinMap = {
 *   name: (ctx) => ctx.get(userStore)[0].name,
 *   count: (ctx) => ctx.get(counterStore)[0].count,
 * };
 * ```
 */
export type MixinMap<C> = Record<string, Mixin<any, C>>;

/**
 * A mixin item for merge: either a direct mixin function or a record of named mixins.
 * - Direct mixin: `(ctx) => ({ name, age })` → spreads result into final object
 * - Named mixin: `{ userName: (ctx) => state.name }` → maps key to mixin result
 */
export type MergeMixinItem<C> = Mixin<any, C> | MixinMap<C>;

/**
 * Array of mixin items for composing multiple mixins.
 *
 * @example
 * ```ts
 * const mixins: MergeMixin = [
 *   selectUser,              // Direct mixin - spreads result
 *   { count: selectCount },  // Named mixin - maps key
 * ];
 * ```
 */
export type MergeMixin<C> = readonly MergeMixinItem<C>[];

/**
 * Infer result type from a record of named mixins.
 * `{ value: (ctx) => 123, fn: (ctx) => () => {} }` → `{ value: number, fn: () => void }`
 */
export type InferMixinRecord<T extends MixinMap<C>, C> = T extends MixinMap<C>
  ? { [K in keyof T]: T[K] extends Mixin<infer R> ? R : never }
  : never;

/**
 * Infer result from a single mixin item.
 */
export type InferMixinItem<T, C> = T extends Mixin<infer R extends object, C>
  ? R
  : T extends MixinMap<C>
  ? InferMixinRecord<T, C>
  : never;

/**
 * Recursively infer and merge types from MergeMixin array.
 */
export type InferMergeMixin<T extends MergeMixin<C>, C> = T extends readonly [
  infer First,
  ...infer Rest extends MergeMixin<C>
]
  ? InferMixinItem<First, C> & InferMergeMixin<Rest, C>
  : unknown;

/**
 * Final merged result type with prettified output.
 */
export type MergeMixinResult<T extends MergeMixin<C>, C> = Prettify<
  InferMergeMixin<T, C>
>;

/**
 * Result type for MixinMap - maps keys to their mixin results.
 */
export type MixinMapResult<T extends MixinMap<C>, C> = Prettify<
  InferMixinRecord<T, C>
>;

/**
 * Extract context type from a record of mixin functions.
 */
type ExtractMixinContext<T> = T extends Record<string, Mixin<any, infer C>>
  ? C
  : T extends Mixin<any, infer C>
  ? C
  : never;

/**
 * Extract context type from an array of mixin items.
 */
type ExtractArrayMixinContext<T extends readonly unknown[]> =
  T extends readonly [infer First, ...infer Rest]
    ? ExtractMixinContext<First> | ExtractArrayMixinContext<Rest>
    : never;

/**
 * Remove "Mixin" suffix from a string type.
 * `"userMixin"` → `"user"`
 * `"selectCount"` → `"selectCount"` (no change)
 */
type StripMixinSuffix<S extends string> = S extends `${infer Prefix}Mixin`
  ? Prefix
  : S;

/**
 * Strip Mixin suffix from record keys (readonly).
 */
type StripMixinSuffixFromRecord<T extends Record<string, Mixin>> = {
  readonly [K in keyof T as K extends string
    ? StripMixinSuffix<K>
    : K]: T[K] extends Mixin<infer R> ? R : never;
};

/**
 * Infer result from a single mixin array item with Mixin suffix stripping.
 * Direct mixin results are made readonly.
 */
type InferMixinArrayItem<T> = T extends Mixin<infer R extends object>
  ? Readonly<R>
  : T extends Record<string, Mixin>
  ? StripMixinSuffixFromRecord<T>
  : never;

/**
 * Recursively infer and merge types from mixin array.
 */
type InferMixinArray<T extends readonly unknown[]> = T extends readonly [
  infer First,
  ...infer Rest
]
  ? InferMixinArrayItem<First> & InferMixinArray<Rest>
  : unknown;

/**
 * Compose multiple mixins into a single mixin function.
 * Accepts any mixin type (Selector or Store context).
 * Automatically removes "Mixin" suffix from keys.
 *
 * @example
 * ```ts
 * // Object syntax - named mixins
 * const composed = mixins({ userMixin, countMixin });
 * // Returns: (ctx) => { user: User, count: number }
 *
 * // Array syntax - merge mixins
 * const merged = mixins([selectUserMixin, { countMixin }]);
 * // Returns: (ctx) => { name: string, age: number, count: number }
 * ```
 */
// Array overload - merge mixins
export function mixins<
  const T extends readonly (Mixin<object> | Record<string, Mixin>)[]
>(
  mixinArray: T
): (context: ExtractArrayMixinContext<T>) => Prettify<InferMixinArray<T>>;
// Object overload - named mixins
export function mixins<const T extends Record<string, Mixin>>(
  mixinMap: T
): (context: ExtractMixinContext<T>) => Prettify<StripMixinSuffixFromRecord<T>>;
export function mixins(
  input: Record<string, Mixin> | readonly (Mixin | Record<string, Mixin>)[]
) {
  // Array syntax - merge mixins
  if (Array.isArray(input)) {
    return (context: unknown) => {
      const result: Record<string, unknown> = {};
      for (const item of input) {
        if (typeof item === "function") {
          // Direct mixin - spread result
          Object.assign(result, item(context));
        } else {
          // Record of mixins - map keys
          for (const key in item) {
            result[stripSuffix(key)] = item[key](context);
          }
        }
      }
      return result;
    };
  }

  // Object syntax - named mixins
  const mixinMap = input as Record<string, Mixin>;
  return (context: unknown) => {
    const result: Record<string, unknown> = {};
    for (const key in mixinMap) {
      result[stripSuffix(key)] = mixinMap[key](context);
    }
    return result;
  };
}

const stripSuffix = (key: string) =>
  key.endsWith("Mixin") ? key.slice(0, -5) : key;
