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
  setup: ({ state, update }) => ({
    increment: () => {
      update((draft) => {
        draft.history.push(draft.count);
        draft.count += draft.step;
      });
    },
    decrement: () => {
      update((draft) => {
        draft.history.push(draft.count);
        draft.count -= draft.step;
      });
    },
    reset: () => {
      update((draft) => {
        draft.history = [];
        draft.count = 0;
      });
    },
    setStep: (step: number) => {
      update((draft) => {
        draft.step = step;
      });
    },
    undo: () => {
      update((draft) => {
        if (state.history.length > 0) {
          draft.count = draft.history.pop()!;
        }
      });
    },
  }),
});
