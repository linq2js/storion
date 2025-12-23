/**
 * AsyncContext creation utilities.
 */

import type { StoreInstance } from "../types";
import type { AsyncContext } from "./types";
import { isSpec } from "../is";
import { storeTuple } from "../utils/storeTuple";
import { createSafe } from "./safe";

/**
 * Create an AsyncContext for use in async handlers.
 *
 * @param abortController - The AbortController for cancellation
 * @param isCancelledOrAborted - Function to check if cancelled
 * @param cancel - Function to cancel the operation
 * @param resolver - Resolver for getting stores/services
 * @returns AsyncContext
 */
export function createAsyncContext(
  abortController: AbortController,
  isCancelledOrAborted: () => boolean,
  cancel: () => void,
  resolver: { get: (specOrFactory: any) => any }
): AsyncContext {
  // Create safe function using shared utility
  const safe = createSafe(
    () => abortController.signal,
    isCancelledOrAborted
  );

  return {
    signal: abortController.signal,

    get(specOrFactory: any): any {
      const instance = resolver.get(specOrFactory);
      if (isSpec(specOrFactory)) {
        const store = instance as StoreInstance<any, any>;
        return storeTuple(store);
      }
      return instance;
    },

    safe,

    cancel,
  };
}

