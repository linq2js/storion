import {
  Prettify,
  type StoreSpec,
  type StateOf,
  type ActionsOf,
  type SelectorContext,
  type Factory,
} from "../types";
import { isSpec } from "../is";

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
 * Proxy type for accessing store state properties and actions as mixins.
 * State properties return mixins that access state values.
 * Actions return mixins that access action functions.
 */
export type MixinProxy<TSpec extends StoreSpec<any, any>> = {
  readonly [K in keyof StateOf<TSpec>]: Mixin<
    StateOf<TSpec>[K],
    SelectorContext
  >;
} & {
  readonly [K in keyof ActionsOf<TSpec>]: Mixin<
    ActionsOf<TSpec>[K],
    SelectorContext
  >;
} & {
  /**
   * Select multiple properties/actions as a composed mixin.
   *
   * @example
   * ```ts
   * // Array syntax - use property names as keys
   * const proxy = mixins(userStore);
   * const userMixin = proxy.select(["name", "age", "setName"]);
   * // Returns: (ctx) => ({ name: string, age: number, setName: function })
   *
   * // Object syntax - map to custom keys
   * const userMixin = proxy.select({ userName: "name", userAge: "age", updateName: "setName" });
   * // Returns: (ctx) => ({ userName: string, userAge: number, updateName: function })
   * ```
   */
  select<
    TKeys extends readonly (keyof StateOf<TSpec> | keyof ActionsOf<TSpec>)[]
  >(
    keys: TKeys
  ): Mixin<
    {
      readonly [K in TKeys[number]]: K extends keyof StateOf<TSpec>
        ? StateOf<TSpec>[K]
        : K extends keyof ActionsOf<TSpec>
        ? ActionsOf<TSpec>[K]
        : never;
    },
    SelectorContext
  >;
  select<
    TMap extends Record<string, keyof StateOf<TSpec> | keyof ActionsOf<TSpec>>
  >(
    map: TMap
  ): Mixin<
    {
      readonly [K in keyof TMap]: TMap[K] extends keyof StateOf<TSpec>
        ? StateOf<TSpec>[TMap[K]]
        : TMap[K] extends keyof ActionsOf<TSpec>
        ? ActionsOf<TSpec>[TMap[K]]
        : never;
    },
    SelectorContext
  >;
};

/**
 * Proxy type for accessing service factory properties as mixins.
 * Each property of the service instance becomes a mixin.
 */
export type ServiceMixinProxy<T> = {
  readonly [K in keyof T]: Mixin<T[K], SelectorContext>;
};

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
 *
 * // Store spec syntax - proxy for state/actions
 * const proxy = mixins(userStore);
 * const { name, doSomething } = useStore(mixins({
 *   name: proxy.name,
 *   doSomething: proxy.doSomething,
 * }));
 *
 * // Factory syntax - proxy for service properties
 * const dbService = (resolver: Resolver) => ({
 *   users: { getAll: () => [] },
 *   posts: { getAll: () => [] },
 * });
 * const serviceProxy = mixins(dbService);
 * const { users } = useStore(mixins({
 *   users: serviceProxy.users,
 * }));
 * ```
 */
// Store spec overload - returns proxy for accessing state/actions as mixins

export function mixins<TSpec extends StoreSpec<any, any>>(
  spec: TSpec
): MixinProxy<TSpec>;
export function mixins<T extends object>(
  factory: Factory<T, []>
): ServiceMixinProxy<T>;
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
  input:
    | StoreSpec<any, any>
    | Factory<any, []>
    | Record<string, Mixin>
    | readonly (Mixin | Record<string, Mixin>)[]
): any {
  // Store spec overload - return proxy (check first since StoreSpec extends Factory)
  if (isSpec(input)) {
    const spec = input as StoreSpec<any, any>;
    const stateKeys = new Set(
      spec.options.state ? Object.keys(spec.options.state) : []
    );

    // Cache mixins as they're accessed
    const mixinCache = new Map<string, Mixin<any, SelectorContext>>();

    const getMixin = (prop: string): Mixin<any, SelectorContext> => {
      if (mixinCache.has(prop)) {
        return mixinCache.get(prop)!;
      }

      let mixin: Mixin<any, SelectorContext>;
      // Check if it's a state property
      if (stateKeys.has(prop)) {
        mixin = (ctx: SelectorContext) => {
          const [state] = ctx.get(spec);
          return state[prop];
        };
      } else {
        // Otherwise, assume it's an action
        mixin = (ctx: SelectorContext) => {
          const [, actions] = ctx.get(spec);
          return actions[prop];
        };
      }

      mixinCache.set(prop, mixin);
      return mixin;
    };

    return new Proxy({} as MixinProxy<typeof spec>, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") {
          return undefined;
        }

        // Handle select method
        if (prop === "select") {
          return (
            keysOrMap:
              | readonly (
                  | keyof StateOf<typeof spec>
                  | keyof ActionsOf<typeof spec>
                )[]
              | Record<
                  string,
                  keyof StateOf<typeof spec> | keyof ActionsOf<typeof spec>
                >
          ) => {
            // Array syntax
            if (Array.isArray(keysOrMap)) {
              const mixinMap: Record<string, Mixin<any, SelectorContext>> = {};
              for (const key of keysOrMap) {
                mixinMap[key as string] = getMixin(key as string);
              }
              return mixins(mixinMap);
            }

            // Object syntax
            const mixinMap: Record<string, Mixin<any, SelectorContext>> = {};
            for (const [newKey, originalKey] of Object.entries(keysOrMap)) {
              mixinMap[newKey] = getMixin(originalKey as string);
            }
            return mixins(mixinMap);
          };
        }

        return getMixin(prop);
      },
    }) as MixinProxy<typeof spec>;
  }

  // Factory overload - return proxy for service properties
  // Check for functions that are not StoreSpecs
  if (typeof input === "function" && input.length > 0 && !isSpec(input)) {
    const factory = input as Factory;
    return new Proxy({} as ServiceMixinProxy<typeof factory>, {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") {
          return undefined;
        }

        return (ctx: SelectorContext) => {
          const service = ctx.get(factory);
          return service[prop];
        };
      },
    }) as ServiceMixinProxy<typeof factory>;
  }

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
