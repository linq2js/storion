import { Factory, MetaEntry } from "../types";

/**
 * Attach metadata to a service or factory function.
 *
 * This allows middleware to access meta information for any factory,
 * not just stores. Meta is queried via `ctx.meta` in middleware context.
 *
 * @example Basic usage
 * ```ts
 * const persist = meta();
 * const priority = meta((level: number) => level);
 *
 * // Attach meta to a service factory
 * const apiService = withMeta(
 *   (resolver) => ({ fetch: () => {} }),
 *   [persist(), priority(1)]
 * );
 *
 * // In middleware, query via ctx.meta
 * const middleware: Middleware = (ctx) => {
 *   if (ctx.meta.any(persist)) {
 *     console.log("This factory should be persisted");
 *   }
 *   return ctx.next();
 * };
 * ```
 *
 * @example Combined with store meta
 * ```ts
 * // Factory meta and store spec meta are merged in ctx.meta
 * const userStore = store({
 *   name: "user",
 *   state: { name: "" },
 *   meta: [persist()], // spec meta
 * });
 *
 * // In middleware, ctx.meta includes both factory.meta and spec.meta
 * ```
 *
 * @param factory - The factory function to attach meta to
 * @param meta - Single MetaEntry or array of MetaEntry
 * @returns The same factory function with `.meta` property attached
 */
export function withMeta<
  TFactory extends Factory,
  TField extends ReturnType<TFactory> extends object
    ? keyof ReturnType<TFactory>
    : any
>(
  factory: TFactory,
  meta: MetaEntry<TField, any> | MetaEntry<TField, any>[]
): TFactory & {
  meta: MetaEntry<TField, any>[];
} {
  return Object.assign(factory, {
    meta: Array.isArray(meta) ? meta : [meta],
  });
}
