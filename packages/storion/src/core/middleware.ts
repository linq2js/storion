/**
 * Middleware utilities for containers.
 *
 * Helpers for composing and conditionally applying middleware.
 */

import type {
  Middleware,
  MiddlewareContext,
  StoreMiddlewareContext,
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
 * Only matches if displayName is present.
 */
function patternsToPredicate(
  patterns: SpecPattern | SpecPattern[]
): (ctx: MiddlewareContext) => boolean {
  if (Array.isArray(patterns)) {
    const predicates = patterns.map(patternToPredicate);
    return (ctx) =>
      ctx.displayName !== undefined &&
      predicates.some((p) => p(ctx.displayName!));
  }
  const predicate = patternToPredicate(patterns);
  return (ctx) => ctx.displayName !== undefined && predicate(ctx.displayName);
}

/**
 * Compose multiple middleware into one.
 * Middleware are applied in order (first middleware wraps the chain).
 */
export function compose(...middlewares: Middleware[]): Middleware {
  if (middlewares.length === 0) {
    return (ctx) => ctx.next();
  }
  if (middlewares.length === 1) {
    return middlewares[0];
  }

  return (ctx: MiddlewareContext): unknown => {
    let index = 0;

    const executeNext = (): unknown => {
      if (index >= middlewares.length) {
        return ctx.next();
      }
      const currentMiddleware = middlewares[index];
      index++;

      // Create a new context with updated next function
      const wrappedCtx: MiddlewareContext =
        ctx.type === "store"
          ? { ...ctx, next: executeNext as () => any }
          : { ...ctx, next: executeNext };

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
 *   (ctx) => ctx.type === "store" && ctx.spec.options.meta?.persist === true,
 *   persistMiddleware
 * );
 *
 * // Multiple middleware
 * applyFor("counterStore", [loggingMiddleware, devtoolsMiddleware]);
 * ```
 */
export function applyFor(
  predicate: (ctx: MiddlewareContext) => boolean,
  middleware: Middleware | Middleware[]
): Middleware;
export function applyFor(
  patterns: SpecPattern | SpecPattern[],
  middleware: Middleware | Middleware[]
): Middleware;
export function applyFor(
  predicateOrPatterns:
    | ((ctx: MiddlewareContext) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: Middleware | Middleware[]
): Middleware {
  // Normalize predicate
  const predicate: (ctx: MiddlewareContext) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  // Normalize middleware to single function
  const composedMiddleware = Array.isArray(middleware)
    ? compose(...middleware)
    : middleware;

  // Return conditional middleware
  return (ctx: MiddlewareContext): unknown => {
    if (predicate(ctx)) {
      return composedMiddleware(ctx);
    }
    return ctx.next();
  };
}

/**
 * Apply middleware to all except those matching predicate or pattern(s).
 *
 * @overload Exclude matching predicate
 * @param predicate - Function that receives context and returns whether to exclude
 * @param middleware - Middleware or array of middleware to apply
 *
 * @overload Exclude matching pattern(s)
 * @param patterns - Pattern or array of patterns to exclude
 * @param middleware - Middleware or array of middleware to apply
 *
 * @example
 * ```ts
 * // Exclude by predicate
 * applyExcept(
 *   (ctx) => ctx.displayName?.startsWith("_") ?? false,
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
  predicate: (ctx: MiddlewareContext) => boolean,
  middleware: Middleware | Middleware[]
): Middleware;
export function applyExcept(
  patterns: SpecPattern | SpecPattern[],
  middleware: Middleware | Middleware[]
): Middleware;
export function applyExcept(
  predicateOrPatterns:
    | ((ctx: MiddlewareContext) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: Middleware | Middleware[]
): Middleware {
  // Convert to predicate and invert
  const matchPredicate: (ctx: MiddlewareContext) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  const invertedPredicate = (ctx: MiddlewareContext) => !matchPredicate(ctx);

  return applyFor(invertedPredicate, middleware);
}

/**
 * Helper to create store-only middleware.
 * The middleware will only run for stores, not plain factories.
 *
 * @example
 * ```ts
 * const storeLogger = forStores((ctx) => {
 *   console.log(`Creating store: ${ctx.spec.displayName}`);
 *   return ctx.next();
 * });
 * ```
 */
export function forStores(
  storeMiddleware: (ctx: StoreMiddlewareContext) => unknown
): Middleware {
  return (ctx: MiddlewareContext): unknown => {
    if (ctx.type === "store") {
      return storeMiddleware(ctx);
    }
    return ctx.next();
  };
}
