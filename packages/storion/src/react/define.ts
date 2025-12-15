/**
 * define() - Shorthand for single-store apps
 *
 * Creates a store instance and a custom hook in one call.
 */

import type {
  StateBase,
  ActionsBase,
  StoreOptions,
  StoreInstance,
  StoreContainer,
  StableResult,
} from "../types";
import { store as createSpec } from "../core/store";
import { container } from "../core/container";
import { useStoreWithContainer } from "./useStore";

/**
 * Selector for define() hook.
 * Receives state and actions directly (no resolve needed).
 */
export type DefineSelector<
  TState extends StateBase,
  TActions extends ActionsBase,
  T
> = (state: Readonly<TState>, actions: TActions) => T;

/**
 * Custom hook returned by define().
 */
export type UseDefinedStore<
  TState extends StateBase,
  TActions extends ActionsBase
> = <T extends object>(
  selector: DefineSelector<TState, TActions, T>
) => StableResult<T>;

/**
 * Result of define() call.
 */
export type DefineResult<
  TState extends StateBase,
  TActions extends ActionsBase
> = readonly [
  StoreInstance<TState, TActions>,
  UseDefinedStore<TState, TActions>
];

/**
 * Create a store instance and custom hook for single-store apps.
 *
 * @example
 * ```ts
 * const [counter, useCounter] = define({
 *   state: { count: 0 },
 *   setup({ state }) {
 *     return {
 *       increment() { state.count++ },
 *       decrement() { state.count-- },
 *     };
 *   }
 * });
 *
 * // Use the instance directly
 * counter.actions.increment();
 * console.log(counter.state.count);
 *
 * // Use the hook in React components
 * function Counter() {
 *   const { count, increment } = useCounter((state, actions) => ({
 *     count: state.count,
 *     increment: actions.increment,
 *   }));
 *
 *   return <button onClick={increment}>{count}</button>;
 * }
 * ```
 *
 * @param options - Store options (state, setup, etc.)
 * @returns Tuple of [instance, hook]
 */
export function define<TState extends StateBase, TActions extends ActionsBase>(
  options: StoreOptions<TState, TActions>
): DefineResult<TState, TActions> {
  // Create spec and dedicated container
  const spec = createSpec(options);
  const dedicatedContainer: StoreContainer = container();

  // Get the singleton instance
  const instance = dedicatedContainer.get(spec);

  // Create custom hook
  const useDefinedStore: UseDefinedStore<TState, TActions> = <T extends object>(
    selector: DefineSelector<TState, TActions, T>
  ): StableResult<T> => {
    return useStoreWithContainer(
      ({ resolve }) => {
        const [state, actions] = resolve(spec);
        return selector(state, actions);
      },
      dedicatedContainer
    );
  };

  return [instance, useDefinedStore] as const;
}

