/**
 * Abortable type guard and symbol.
 *
 * Extracted to a separate file to avoid circular dependencies
 * between safe.ts and abortable.ts.
 */

// =============================================================================
// SYMBOL
// =============================================================================

/**
 * Symbol used to identify Abortable functions.
 * @internal
 */
export const abortableSymbol = Symbol.for("storion.abortable");

// =============================================================================
// TYPE GUARD
// =============================================================================

/**
 * Check if a value is an Abortable function.
 *
 * @example
 * ```ts
 * if (isAbortable(fn)) {
 *   fn.withSignal(signal, ...args);
 * }
 * ```
 */
export function isAbortable(fn: unknown): fn is { withSignal: Function } {
  return (
    typeof fn === "function" &&
    abortableSymbol in fn &&
    (fn as any)[abortableSymbol] === true
  );
}

