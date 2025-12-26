/**
 * create() - Shorthand for single-store apps
 *
 * Creates a store instance, a custom hook, and a bound withStore in one call.
 */

import type {
  StateBase,
  ActionsBase,
  StoreOptions,
  StoreInstance,
  StableResult,
  ContainerOptions,
  SelectorContext,
} from "../types";
import { store as createSpec } from "../core/store";
import { container } from "../core/container";
import { useStoreWithContainer } from "./useStore";
import {
  createWithStore,
  type BoundWithStore,
  type UseContextHook,
} from "./withStore";

/**
 * Selector for create() hook.
 * Receives state and actions directly (no get needed), plus SelectorContext for advanced features.
 */
export type CreateSelector<
  TState extends StateBase,
  TActions extends ActionsBase,
  T
> = (state: Readonly<TState>, actions: TActions, ctx: SelectorContext) => T;

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
 * Context type for withStore hooks created by create().
 * Receives [state, actions] tuple directly.
 */
export type CreatedStoreContext<
  TState extends StateBase,
  TActions extends ActionsBase
> = readonly [Readonly<TState>, TActions];

/**
 * WithStore function bound to a specific store created by create().
 * Hook receives [state, actions] tuple directly instead of SelectorContext.
 */
export type WithCreatedStore<
  TState extends StateBase,
  TActions extends ActionsBase
> = BoundWithStore<CreatedStoreContext<TState, TActions>>;

/**
 * Result of create() call.
 */
export type CreateResult<
  TState extends StateBase,
  TActions extends ActionsBase
> = readonly [
  StoreInstance<TState, TActions>,
  UseCreatedStore<TState, TActions>,
  WithCreatedStore<TState, TActions>
];

/**
 * Create a store instance, custom hook, and bound withStore for single-store apps.
 *
 * @example
 * ```ts
 * const [counter, useCounter, withCounter] = create({
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
 *   const { count, increment } = useCounter((state, actions, ctx) => ({
 *     count: state.count,
 *     increment: actions.increment,
 *     // ctx provides: mixin, scoped, once, id, container, etc.
 *   }));
 *
 *   return <button onClick={increment}>{count}</button>;
 * }
 *
 * // Use withStore for separation of concerns
 * const CounterDisplay = withCounter(
 *   ([state, actions], props: { multiplier: number }) => ({
 *     count: state.count * props.multiplier,
 *     increment: actions.increment,
 *   }),
 *   ({ count, increment }) => (
 *     <button onClick={increment}>{count}</button>
 *   )
 * );
 *
 * // HOC mode
 * const withCounterData = withCounter(([state]) => ({
 *   count: state.count,
 * }));
 * const DisplayValue = withCounterData(({ count }) => <span>{count}</span>);
 * ```
 *
 * @param storeOptions - Store options (state, setup, etc.)
 * @param containerOptions - Optional container options (middleware, etc.)
 * @returns Tuple of [instance, hook, withStore]
 */
export function create<TState extends StateBase, TActions extends ActionsBase>(
  storeOptions: StoreOptions<TState, TActions>,
  containerOptions?: ContainerOptions
): CreateResult<TState, TActions> {
  // Create spec and dedicated container
  const spec = createSpec(storeOptions);
  const dedicatedContainer = container(containerOptions);

  // Get the singleton instance
  const instance = dedicatedContainer.get(spec);

  // Create custom hook
  const useCreatedStore: UseCreatedStore<TState, TActions> = <T extends object>(
    selector: CreateSelector<TState, TActions, T>
  ): StableResult<T> => {
    return useStoreWithContainer((ctx) => {
      const [state, actions] = ctx.get(spec);
      return selector(state, actions, ctx);
    }, dedicatedContainer);
  };

  // Create a reactive hook that matches UseContextHook signature
  // This hook takes a selector (ctx: [state, actions]) => T and returns T reactively
  const useCreatedStoreContext: UseContextHook<
    CreatedStoreContext<TState, TActions>
  > = <T extends object>(
    selector: (ctx: CreatedStoreContext<TState, TActions>) => T
  ): T => {
    // Use useStoreWithContainer to get reactivity, convert the context format
    return useStoreWithContainer(({ get }) => {
      const [state, actions] = get(spec);
      // Pass [state, actions] tuple to the selector
      return selector([state, actions] as const);
    }, dedicatedContainer) as T;
  };

  // Create withStore bound to this store's context using the custom hook
  const withStore = createWithStore(useCreatedStoreContext);

  return [instance, useCreatedStore, withStore] as const;
}
