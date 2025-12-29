/**
 * Store Spec - Creates store specifications (definitions).
 *
 * A store spec is both a definition AND a factory function:
 * - As object: holds name, options, and STORION_TYPE
 * - As function: `spec(resolver) => StoreInstance`
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreOptions,
  type StoreInstance,
  type Resolver,
  type MetaEntry,
} from "../types";

import { generateSpecName } from "./generator";
import { createStoreInstance } from "./storeInstance";
import { InvalidMetaFieldError } from "../errors";

// =============================================================================
// Store Spec Factory
// =============================================================================

/**
 * Create a store specification.
 *
 * The spec is both a definition AND a factory function:
 * - As object: holds name, options, and STORION_TYPE
 * - As function: `spec(resolver) => StoreInstance`
 *
 * Instances are created lazily via container.get() or by calling spec directly.
 */
export function store<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
>(options: StoreOptions<TState, TActions>): StoreSpec<TState, TActions> {
  const displayName = options.name ?? generateSpecName();

  // Create callable factory function
  const spec = function (resolver: Resolver): StoreInstance<TState, TActions> {
    return createStoreInstance(
      spec as StoreSpec<TState, TActions>,
      resolver,
      {}
    );
  } as StoreSpec<TState, TActions>;

  const fields = Object.keys(options.state as object);
  const fieldSet = new Set(fields);

  // Normalize meta to array
  const meta: MetaEntry[] = options.meta
    ? "metas" in options.meta
      ? options.meta.metas
      : [options.meta]
    : [];

  // Validate that all meta field references exist in state
  for (const entry of meta) {
    if (entry.fields) {
      for (const field of entry.fields) {
        if (!fieldSet.has(field)) {
          throw new InvalidMetaFieldError(displayName, field, fields);
        }
      }
    }
  }

  // Assign properties to make it a valid StoreSpec
  // Note: we use displayName instead of name since name is a reserved function property
  Object.defineProperties(spec, {
    [STORION_TYPE]: { value: "store.spec", enumerable: false },
    displayName: { value: displayName, enumerable: true, writable: false },
    options: { value: options, enumerable: true, writable: false },
    meta: {
      value: meta,
      enumerable: true,
      writable: false,
    },
    fields: {
      value: fields,
      enumerable: true,
      writable: false,
    },
  });

  return spec;
}
