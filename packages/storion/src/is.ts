/**
 * Type guards for Storion objects.
 *
 * Use `is(value, kind)` to check if a value is a specific Storion object type.
 */

import {
  STORION_TYPE,
  StorionKind,
  StorionObject,
  StoreSpec,
  StoreContainer,
  StoreInstance,
  StoreContext,
  SelectorContext,
  Focus,
  StateBase,
  ActionsBase,
} from "./types";

/**
 * Check if a value is a Storion object of a specific kind.
 *
 * @example
 * if (is(value, "store.spec")) {
 *   // value is StoreSpec
 * }
 *
 * if (is(value, "store")) {
 *   // value is StoreInstance
 * }
 *
 * if (is(value, "focus")) {
 *   // value is Focus
 * }
 */
export function is<K extends StorionKind>(
  value: unknown,
  kind: K
): value is StorionObjectForKind<K> {
  return (
    value !== null &&
    typeof value === "object" &&
    STORION_TYPE in value &&
    (value as StorionObject)[STORION_TYPE] === kind
  );
}

/**
 * Check if a value is any Storion object.
 *
 * @example
 * if (isStorion(value)) {
 *   console.log(value[STORION_SYMBOL]); // "spec" | "store" | ...
 * }
 */
export function isStorion(value: unknown): value is StorionObject {
  return (
    value !== null &&
    typeof value === "object" &&
    STORION_TYPE in value &&
    typeof (value as StorionObject)[STORION_TYPE] === "string"
  );
}

/**
 * Get the kind of a Storion object.
 *
 * @example
 * const kind = getKind(myStore); // "store"
 */
export function getKind(value: StorionObject): StorionKind {
  return value[STORION_TYPE];
}

// =============================================================================
// Specific Type Guards
// =============================================================================

/**
 * Check if a value is a StoreSpec.
 */
export function isSpec<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
>(value: unknown): value is StoreSpec<TState, TActions> {
  return is(value, "store.spec");
}

/**
 * Check if a value is a StoreContainer.
 */
export function isContainer(value: unknown): value is StoreContainer {
  return is(value, "container");
}

/**
 * Check if a value is a StoreInstance.
 */
export function isStore<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
>(value: unknown): value is StoreInstance<TState, TActions> {
  return is(value, "store");
}

/**
 * Check if a value is a Focus.
 */
export function isFocus<TValue = unknown>(
  value: unknown
): value is Focus<TValue> {
  return is(value, "focus");
}

/**
 * Check if a value is a StoreContext.
 */
export function isStoreContext<TState extends StateBase = StateBase>(
  value: unknown
): value is StoreContext<TState> {
  return is(value, "store.context");
}

/**
 * Check if a value is a SelectorContext.
 */
export function isSelectorContext(value: unknown): value is SelectorContext {
  return is(value, "selector.context");
}

/**
 * Check if a value is a store Action.
 */
export function isAction(
  value: unknown
): value is StorionObject<"store.action"> {
  return is(value, "store.action");
}

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Maps StorionKind to the corresponding type.
 */
type StorionObjectForKind<K extends StorionKind> = K extends "store.spec"
  ? StoreSpec<any, any>
  : K extends "container"
  ? StoreContainer
  : K extends "store"
  ? StoreInstance<any, any>
  : K extends "focus"
  ? Focus<any>
  : K extends "store.action"
  ? StorionObject<"store.action"> // Will be replaced with Action type when implemented
  : K extends "store.context"
  ? StoreContext<any>
  : K extends "selector.context"
  ? SelectorContext
  : K extends "async.meta"
  ? StorionObject<"async.meta"> // Will be replaced with AsyncMeta when implemented
  : never;
