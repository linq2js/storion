/**
 * Middleware utilities
 *
 * Helpers for composing and conditionally applying middleware.
 */

import type {
  StateBase,
  ActionsBase,
  StoreSpec,
  StoreMiddleware,
} from "../types";

/** Pattern type for matching spec names */
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
 * Convert pattern(s) to a spec predicate.
 */
function patternsToPredicate(
  patterns: SpecPattern | SpecPattern[]
): (spec: StoreSpec<any, any>) => boolean {
  if (Array.isArray(patterns)) {
    const predicates = patterns.map(patternToPredicate);
    return (spec) => predicates.some((p) => p(spec.name));
  }
  const predicate = patternToPredicate(patterns);
  return (spec) => predicate(spec.name);
}

/**
 * Compose multiple middleware into one.
 * Middleware are applied in order (first middleware wraps the chain).
 */
export function compose(
  ...middlewares: StoreMiddleware[]
): StoreMiddleware {
  if (middlewares.length === 0) {
    return (spec, next) => next(spec);
  }
  if (middlewares.length === 1) {
    return middlewares[0];
  }

  return <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>,
    next: (spec: StoreSpec<S, A>) => StoreInstance<S, A>
  ) => {
    // Build chain from right to left
    let chain = next;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      const prevChain = chain;
      chain = (s) => middleware(s, prevChain);
    }
    return chain(spec);
  };
}

// Import StoreInstance for type
import type { StoreInstance } from "../types";

/**
 * Conditionally apply middleware based on a predicate or pattern(s).
 *
 * @overload Apply middleware when predicate returns true
 * @param predicate - Function that receives spec and returns whether to apply middleware
 * @param middleware - Middleware or array of middleware to apply
 *
 * @overload Apply middleware for matching pattern(s)
 * @param patterns - Pattern or array of patterns to match spec names
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
 *   (spec) => spec.options.meta?.persist === true,
 *   persistMiddleware
 * );
 *
 * // Multiple middleware
 * applyFor("counterStore", [loggingMiddleware, devtoolsMiddleware]);
 * ```
 */
export function applyFor(
  predicate: (spec: StoreSpec<any, any>) => boolean,
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyFor(
  patterns: SpecPattern | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyFor(
  predicateOrPatterns:
    | ((spec: StoreSpec<any, any>) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware {
  // Normalize predicate
  const predicate: (spec: StoreSpec<any, any>) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  // Normalize middleware to single function
  const composedMiddleware = Array.isArray(middleware)
    ? compose(...middleware)
    : middleware;

  // Return conditional middleware
  return <S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>,
    next: (spec: StoreSpec<S, A>) => StoreInstance<S, A>
  ) => {
    if (predicate(spec)) {
      return composedMiddleware(spec, next);
    }
    return next(spec);
  };
}

/**
 * Apply middleware to all stores except those matching predicate or pattern(s).
 *
 * @overload Exclude stores matching predicate
 * @param predicate - Function that receives spec and returns whether to exclude
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
 *   (spec) => spec.name.startsWith("_"),
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
  predicate: (spec: StoreSpec<any, any>) => boolean,
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyExcept(
  patterns: SpecPattern | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware;
export function applyExcept(
  predicateOrPatterns:
    | ((spec: StoreSpec<any, any>) => boolean)
    | SpecPattern
    | SpecPattern[],
  middleware: StoreMiddleware | StoreMiddleware[]
): StoreMiddleware {
  // Convert to predicate and invert
  const matchPredicate: (spec: StoreSpec<any, any>) => boolean =
    typeof predicateOrPatterns === "function"
      ? predicateOrPatterns
      : patternsToPredicate(predicateOrPatterns);

  const invertedPredicate = (spec: StoreSpec<any, any>) =>
    !matchPredicate(spec);

  return applyFor(invertedPredicate, middleware);
}

