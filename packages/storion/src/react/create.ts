/**
 * create() - Shorthand for single-store apps
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
 * Selector for create() hook.
 * Receives state and actions directly (no get needed).
 */
export type CreateSelector<
  TState extends StateBase,
  TActions extends ActionsBase,
  T
> = (state: Readonly<TState>, actions: TActions) => T;

/**
 * Custom hook returned by create().
 */
export type UseCreatedStore<
  TState extends StateBase,
  TActions extends ActionsBase
> = <T extends object>(
  selector: CreateSelector<TState, TActions, T>
) => StableResult<T>;

/**
 * Result of create() call.
 */
export type CreateResult<
  TState extends StateBase,
  TActions extends ActionsBase
> = readonly [
  StoreInstance<TState, TActions>,
  UseCreatedStore<TState, TActions>
];

/**
 * Create a store instance and custom hook for single-store apps.
 *
 * @example
 * ```ts
 * const [counter, useCounter] = create({
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
export function create<TState extends StateBase, TActions extends ActionsBase>(
  options: StoreOptions<TState, TActions>
): CreateResult<TState, TActions> {
  // Create spec and dedicated container
  const spec = createSpec(options);
  const dedicatedContainer: StoreContainer = container();

  // Get the singleton instance
  const instance = dedicatedContainer.get(spec);

  // Create custom hook
  const useCreatedStore: UseCreatedStore<TState, TActions> = <T extends object>(
    selector: CreateSelector<TState, TActions, T>
  ): StableResult<T> => {
    return useStoreWithContainer(
      ({ get }) => {
        const [state, actions] = get(spec);
        return selector(state, actions);
      },
      dedicatedContainer
    );
  };

  return [instance, useCreatedStore] as const;
}

