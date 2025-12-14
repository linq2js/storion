/**
 * Zustand store implementations for benchmarks
 */

import { createStore } from "zustand/vanilla";

// Simple counter store
export function createZustandCounter() {
  const store = createStore<{
    count: number;
    increment: () => void;
    decrement: () => void;
    set: (value: number) => void;
  }>((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
    decrement: () => set((state) => ({ count: state.count - 1 })),
    set: (value: number) => set({ count: value }),
  }));

  return store;
}

// Large state store
interface LargeState {
  values: Record<string, number>;
  update: (key: string, value: number) => void;
  batchUpdate: (updates: Record<string, number>) => void;
}

export function createZustandLargeState(size: number) {
  const initialValues: Record<string, number> = {};
  for (let i = 0; i < size; i++) {
    initialValues[`prop${i}`] = i;
  }

  const store = createStore<LargeState>((set) => ({
    values: initialValues,
    update: (key: string, value: number) =>
      set((state) => ({ values: { ...state.values, [key]: value } })),
    batchUpdate: (updates: Record<string, number>) =>
      set((state) => ({ values: { ...state.values, ...updates } })),
  }));

  return store;
}

// Derived/computed store (using subscribe for manual derivation)
export function createZustandDerived() {
  const baseStore = createStore<{
    a: number;
    b: number;
    setA: (value: number) => void;
    setB: (value: number) => void;
  }>((set) => ({
    a: 1,
    b: 2,
    setA: (value: number) => set({ a: value }),
    setB: (value: number) => set({ b: value }),
  }));

  const derivedStore = createStore<{
    sum: number;
    product: number;
  }>(() => ({
    sum: 3,
    product: 2,
  }));

  // Manual subscription for derived values
  baseStore.subscribe((state) => {
    derivedStore.setState({
      sum: state.a + state.b,
      product: state.a * state.b,
    });
  });

  return { base: baseStore, derived: derivedStore };
}

// Store with many subscribers
export function createZustandWithSubscribers(subscriberCount: number) {
  const store = createStore<{
    value: number;
    increment: () => void;
  }>((set) => ({
    value: 0,
    increment: () => set((state) => ({ value: state.value + 1 })),
  }));

  const unsubscribes: VoidFunction[] = [];
  for (let i = 0; i < subscriberCount; i++) {
    unsubscribes.push(store.subscribe(() => {}));
  }

  return {
    store,
    cleanup: () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    },
  };
}

