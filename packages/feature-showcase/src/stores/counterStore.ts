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
  setup: ({ state }) => ({
    increment: () => {
      state.history.push(state.count);
      state.count += state.step;
    },
    decrement: () => {
      state.history.push(state.count);
      state.count -= state.step;
    },
    reset: () => {
      state.history = [];
      state.count = 0;
    },
    setStep: (step: number) => {
      state.step = step;
    },
    undo: () => {
      if (state.history.length > 0) {
        state.count = state.history.pop()!;
      }
    },
  }),
});
