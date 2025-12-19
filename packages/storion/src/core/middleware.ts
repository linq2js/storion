/**
 * Middleware utilities for store containers.
 *
 * Helpers for composing and conditionally applying StoreMiddleware.
 */

import { isSpec } from "../is";
import type {
  StoreMiddleware,
  StoreMiddlewareContext,
  StateBase,
  ActionsBase,
  StoreInstance,
} from "../types";

/** Pattern type for matching displayName */
export type SpecPattern = string | RegExp;

/**
 * Convert a pattern to a predicate function.
 *
 * String patterns support wildcards:
 * - `"user*"` → startsWith("user")
 * - `"*Store"` → endsWith("Store")
 * - `"*auth*"` → includes("auth")
 * - `"userStore"` → exact match
 *
 * RegExp patterns use standard regex matching.
 */
function patternToPredicate(pattern: SpecPattern): (name: string) => boolean {
  // RegExp
  if (pattern instanceof RegExp) {
    return (name) => pattern.test(name);
  }

  // String with wildcards
  const startsWithWildcard = pattern.startsWith("*");
  const endsWithWildcard = pattern.endsWith("*");

  if (startsWithWildcard && endsWithWildcard) {
    // *auth* → includes
    const substr = pattern.slice(1, -1);
    return (name) => name.includes(substr);
  }
  if (startsWithWildcard) {
    // *Store → endsWith
    const suffix = pattern.slice(1);
    return (name) => name.endsWith(suffix);
  }
  if (endsWithWildcard) {
    // user* → startsWith
    const prefix = pattern.slice(0, -1);
    return (name) => name.startsWith(prefix);
  }
  // Exact match
  return (name) => name === pattern;
}

/**
 * Convert pattern(s) to a context predicate.
 */
function patternsToPredicate(
  patterns: SpecPattern | SpecPattern[]
): (ctx: StoreMiddlewareContext) => boolean {
  if (Array.isArray(patterns)) {
    const predicates = patterns.map(patternToPredicate);
    return (ctx) => predicates.some((p) => p(ctx.displayName));
  }
  const predicate = patternToPredicate(patterns);
  return (ctx) => predicate(ctx.displayName);
}

/**
 * Compose multiple store middleware into one.
 * Middleware are applied in order (first middleware wraps the chain).
 */
export function compose(...middlewares: StoreMiddleware[]): StoreMiddleware {
  if (middlewares.length === 0) {
    return (ctx) => ctx.next();
  }
  if (middlewares.length === 1) {
    return middlewares[0];
  }

  return <S extends StateBase, A extends ActionsBase>(
    ctx: StoreMiddlewareContext<S, A>
  ): StoreInstance<S, A> => {
    let index = 0;

    const executeNext = (): StoreInstance<S, A> => {
      if (index >= middlewares.length) {
        return ctx.next();
      }
      const currentMiddleware = middlewares[index];
      index++;

      // Create a new context with updated next function
      const wrappedCtx: StoreMiddlewareContext<S, A> = {
        ...ctx,
        next: executeNext,
      };

      return currentMiddleware(wrappedCtx);
    };

    return executeNext();
  };
}

/**
 * Conditionally apply middleware based on a predicate or pattern(s).
 *
 * @overload Apply middleware when predicate returns true
 * @param predicate - Function that receives context and returns whether to apply middleware
 * @param middleware - Middleware or array of middleware to apply
 *
 * @overload Apply middleware for matching pattern(s)
 * @param patterns - Pattern or array of patterns to match displayName
 * @param middleware - Middleware or array of middleware to apply
 *
 * Pattern types:
 * - `"userStore"` - exact match
 * - `"user*"` - startsWith
 * - `"*Store"` - endsWith
 * - `"*auth*"` - includes
 * - `/^(user|auth)/` - RegExp
 *
 * @example
 * ```ts
 * // Exact match
 * applyFor("userStore", loggingMiddleware);
 *
 * // Wildcard patterns
 * applyFor("user*", loggingMiddleware);       // userStore, userCache, etc.
 * applyFor("*Store", loggingMiddleware);      // userStore, authStore, etc.
 * applyFor("*auth*", loggingMiddleware);      // authStore, userAuth, etc.
 *
 * // RegExp
 * applyFor(/^(user|auth)Store$/, loggingMiddleware);
 *
 * // Multiple patterns
 * applyFor(["userStore", "auth*"], loggingMiddleware);
 *
 * // Predicate function
 * applyFor(
 *   (ctx) => ctx.spec.options.meta?.persist === true,
 *   persistMiddleware
 * );
 *
 * // Multiple middleware
 * applyFor("counterStore", [loggingMiddleware, devtoolsMiddleware]);
 * ```
 */
export function applyFor(
  predicate: (ctx: StoreMiddlewareContext) => boolean,
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyFor(
  patterns: SpecPattern | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyFor(
  predicateOrPatterns:
    | ((ctx: StoreMiddlewareContext) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware {
  // Normalize predicate
  const predicate: (
    ctx: StoreMiddlewareContext<StateBase, ActionsBase>
  ) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  // Normalize middleware to single function
  const composedMiddleware = Array.isArray(middleware)
    ? compose(...middleware)
    : middleware;

  // Return conditional middleware
  return <S extends StateBase, A extends ActionsBase>(
    ctx: StoreMiddlewareContext<S, A>
  ): StoreInstance<S, A> => {
    if (isSpec(ctx.factory)) {
      const spec = ctx.factory;
      const storeMiddlewareCtx = {
        ...ctx,
        spec,
      } as unknown as StoreMiddlewareContext<StateBase, ActionsBase>;
      if (predicate(storeMiddlewareCtx)) {
        return composedMiddleware(
          storeMiddlewareCtx as unknown as StoreMiddlewareContext<S, A>
        );
      }
    }

    return ctx.next();
  };
}

/**
 * Apply middleware to all stores except those matching predicate or pattern(s).
 *
 * @overload Exclude stores matching predicate
 * @param predicate - Function that receives context and returns whether to exclude
 * @param middleware - Middleware or array of middleware to apply
 *
 * @overload Exclude stores matching pattern(s)
 * @param patterns - Pattern or array of patterns to exclude
 * @param middleware - Middleware or array of middleware to apply
 *
 * @example
 * ```ts
 * // Exclude by predicate
 * applyExcept(
 *   (ctx) => ctx.displayName.startsWith("_"),
 *   loggingMiddleware
 * );
 *
 * // Exclude exact names
 * applyExcept(["tempStore", "cacheStore"], persistMiddleware);
 *
 * // Exclude with wildcards
 * applyExcept("_*", loggingMiddleware);        // exclude _internal, _temp, etc.
 * applyExcept("*Cache", persistMiddleware);    // exclude userCache, dataCache, etc.
 *
 * // Exclude with RegExp
 * applyExcept(/^(temp|cache)/, persistMiddleware);
 * ```
 */
export function applyExcept(
  predicate: (ctx: StoreMiddlewareContext) => boolean,
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyExcept(
  patterns: SpecPattern | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyExcept(
  predicateOrPatterns:
    | ((ctx: StoreMiddlewareContext) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware {
  // Convert to predicate and invert
  const matchPredicate: (ctx: StoreMiddlewareContext) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  const invertedPredicate = (ctx: StoreMiddlewareContext) =>
    !matchPredicate(ctx);

  return applyFor(invertedPredicate, middleware);
}
