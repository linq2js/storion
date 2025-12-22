/**
 * AsyncContext creation utilities.
 */

import type { StoreInstance } from "../types";
import type { AsyncContext } from "./types";
import { isSpec } from "../is";
import { storeTuple } from "../utils/storeTuple";

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

    safe<T>(promiseOrCallback: Promise<T> | ((...args: unknown[]) => T)): any {
      if (promiseOrCallback instanceof Promise) {
        // Wrap promise - never resolve/reject if cancelled
        return new Promise<T>((resolve, reject) => {
          promiseOrCallback.then(
            (value) => {
              if (!isCancelledOrAborted()) {
                resolve(value);
              }
              // Never resolve/reject if cancelled - promise stays pending
            },
            (error) => {
              if (!isCancelledOrAborted()) {
                reject(error);
              }
              // Never resolve/reject if cancelled
            }
          );
        });
      }

      // Wrap callback - don't run if cancelled
      return (...args: unknown[]) => {
        if (!isCancelledOrAborted()) {
          return (promiseOrCallback as (...args: unknown[]) => T)(...args);
        }
        return undefined;
      };
    },

    cancel,
  };
}

