/**
 * Redux Toolkit store implementations for benchmarks
 */

import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";

// Simple counter store
export function createReduxCounter() {
  const counterSlice = createSlice({
    name: "counter",
    initialState: { count: 0 },
    reducers: {
      increment: (state) => {
        state.count++;
      },
      decrement: (state) => {
        state.count--;
      },
      set: (state, action: PayloadAction<number>) => {
        state.count = action.payload;
      },
    },
  });

  const store = configureStore({
    reducer: counterSlice.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  return { store, actions: counterSlice.actions };
}

// Large state store
export function createReduxLargeState(size: number) {
  const initialState: Record<string, number> = {};
  for (let i = 0; i < size; i++) {
    initialState[`prop${i}`] = i;
  }

  const largeSlice = createSlice({
    name: "large",
    initialState,
    reducers: {
      update: (state, action: PayloadAction<{ key: string; value: number }>) => {
        state[action.payload.key] = action.payload.value;
      },
      batchUpdate: (state, action: PayloadAction<Record<string, number>>) => {
        for (const [key, value] of Object.entries(action.payload)) {
          state[key] = value;
        }
      },
    },
  });

  const store = configureStore({
    reducer: largeSlice.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  return { store, actions: largeSlice.actions };
}

// Derived/computed store (using selectors)
export function createReduxDerived() {
  const baseSlice = createSlice({
    name: "base",
    initialState: { a: 1, b: 2 },
    reducers: {
      setA: (state, action: PayloadAction<number>) => {
        state.a = action.payload;
      },
      setB: (state, action: PayloadAction<number>) => {
        state.b = action.payload;
      },
    },
  });

  const store = configureStore({
    reducer: baseSlice.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  // Selectors (computed on access, not reactive)
  const selectSum = (state: { a: number; b: number }) => state.a + state.b;
  const selectProduct = (state: { a: number; b: number }) => state.a * state.b;

  return { store, actions: baseSlice.actions, selectSum, selectProduct };
}

// Store with many subscribers
export function createReduxWithSubscribers(subscriberCount: number) {
  const slice = createSlice({
    name: "subscribed",
    initialState: { value: 0 },
    reducers: {
      increment: (state) => {
        state.value++;
      },
    },
  });

  const store = configureStore({
    reducer: slice.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  const unsubscribes: VoidFunction[] = [];
  for (let i = 0; i < subscriberCount; i++) {
    unsubscribes.push(store.subscribe(() => {}));
  }

  return {
    store,
    actions: slice.actions,
    cleanup: () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    },
  };
}

