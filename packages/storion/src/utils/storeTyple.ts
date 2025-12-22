import { ActionsBase, StateBase } from "../types";

export function storeTuple<S extends StateBase, A extends ActionsBase>(
  state: S,
  actions: A
) {
  return Object.assign([state, actions] as const, {
    state,
    actions,
  });
}
