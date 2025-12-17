/**
 * Counter Store - Basic store with state and actions
 *
 * Demonstrates:
 * - Basic store creation with store()
 * - State definition
 * - Actions (increment, decrement, reset)
 */
import { store, type ActionsBase } from "storion";

interface CounterState {
  count: number;
  step: number;
  history: number[];
}

interface CounterActions extends ActionsBase {
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  setStep: (step: number) => void;
  undo: () => void;
}

export const counterStore = store<CounterState, CounterActions>({
  name: "counter",
  state: {
    count: 0,
    step: 1,
    history: [],
  },
  setup: ({ update }) => ({
    increment: update.action((draft) => {
      draft.history.push(draft.count);
      draft.count += draft.step;
    }),
    decrement: update.action((draft) => {
      draft.history.push(draft.count);
      draft.count -= draft.step;
    }),
    reset: update.action((draft) => {
      draft.history = [];
      draft.count = 0;
    }),
    setStep: update.action((draft, step: number) => {
      draft.step = step;
    }),
    undo: update.action((draft) => {
      if (draft.history.length > 0) {
        draft.count = draft.history.pop()!;
      }
    }),
  }),
});
