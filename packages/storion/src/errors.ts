/**
 * Custom error classes for Storion.
 * Using named error classes helps with error identification and handling.
 */

/**
 * Base class for all Storion errors.
 */
export class StorionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorionError";
  }
}

// =============================================================================
// Setup Phase Errors
// =============================================================================

/**
 * Thrown when a method that should only be called during setup phase
 * is called outside of it (e.g., inside actions or async callbacks).
 */
export class SetupPhaseError extends StorionError {
  constructor(
    method: string,
    hint?: string
  ) {
    super(
      `${method}() can only be called during setup phase. ` +
        `Do not call ${method}() inside actions or async callbacks.` +
        (hint ? ` ${hint}` : "")
    );
    this.name = "SetupPhaseError";
  }
}

// =============================================================================
// Lifetime Errors
// =============================================================================

/**
 * Thrown when a store with keepAlive lifetime tries to depend on
 * or create a store with autoDispose lifetime.
 */
export class LifetimeMismatchError extends StorionError {
  constructor(
    parentName: string,
    childName: string,
    operation: "depend on" | "create"
  ) {
    super(
      `Lifetime mismatch: Store "${parentName}" (keepAlive) cannot ${operation} ` +
        `store "${childName}" (autoDispose). A long-lived store cannot ${operation} ` +
        `a store that may be disposed. Either change "${parentName}" to autoDispose, ` +
        `or change "${childName}" to keepAlive.`
    );
    this.name = "LifetimeMismatchError";
  }
}

// =============================================================================
// Async Function Errors
// =============================================================================

/**
 * Thrown when an async function (returning Promise) is used where
 * a synchronous function is required.
 */
export class AsyncFunctionError extends StorionError {
  constructor(context: string, hint: string) {
    super(`${context} must be synchronous. ${hint}`);
    this.name = "AsyncFunctionError";
  }
}

// =============================================================================
// Store Lifecycle Errors
// =============================================================================

/**
 * Thrown when attempting to call an action on a disposed store.
 */
export class StoreDisposedError extends StorionError {
  constructor(storeId: string) {
    super(`Cannot call action on disposed store: ${storeId}`);
    this.name = "StoreDisposedError";
  }
}

/**
 * Thrown when an action definition is not a function.
 */
export class InvalidActionError extends StorionError {
  constructor(actionName: string, actualType: string) {
    super(
      `Action "${actionName}" must be a function, got ${actualType}. ` +
        `If using focus(), destructure it and return the getter/setter separately: ` +
        `const [get, set] = focus("path"); return { get, set };`
    );
    this.name = "InvalidActionError";
  }
}

// =============================================================================
// Context/Hook Errors
// =============================================================================

/**
 * Thrown when pick() is called outside of an effect or useStore selector.
 */
export class HooksContextError extends StorionError {
  constructor(method: string, requiredContext: string) {
    super(
      `${method}() must be called inside ${requiredContext}. ` +
        `It requires an active tracking context.`
    );
    this.name = "HooksContextError";
  }
}

/**
 * Thrown when useContainer is called outside of StoreProvider.
 */
export class ProviderMissingError extends StorionError {
  constructor(hook: string, provider: string) {
    super(`${hook} must be used within a ${provider}`);
    this.name = "ProviderMissingError";
  }
}

// =============================================================================
// Local Store Errors
// =============================================================================

/**
 * Thrown when a local store (useLocalStore) has dependencies.
 */
export class LocalStoreDependencyError extends StorionError {
  constructor(storeName: string, dependencyCount: number) {
    super(
      `Local store must not have dependencies, but "${storeName}" has ${dependencyCount} dependencies. ` +
        `Use useStore() with a global container for stores with dependencies.`
    );
    this.name = "LocalStoreDependencyError";
  }
}

// =============================================================================
// Effect Errors
// =============================================================================

/**
 * Thrown when refresh() is called while the effect is still running.
 */
export class EffectRefreshError extends StorionError {
  constructor() {
    super("Effect is already running, cannot refresh");
    this.name = "EffectRefreshError";
  }
}

// Scoped Errors
// =============================================================================

/**
 * Thrown when scoped() is called outside of a selector function.
 */
export class ScopedOutsideSelectorError extends StorionError {
  constructor() {
    super(
      "scoped() can only be called during selector execution. " +
        "Do not call scoped() in callbacks, event handlers, or async functions."
    );
    this.name = "ScopedOutsideSelectorError";
  }
}

