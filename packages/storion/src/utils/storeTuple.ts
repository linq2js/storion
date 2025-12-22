import { ActionsBase, StateBase, StoreInstance } from "../types";

export function storeTuple<S extends StateBase, A extends ActionsBase>(
  instance: StoreInstance<S, A>
) {
  const { state, actions } = instance;
  return Object.assign([state, actions, instance] as const, { state, actions });
}
