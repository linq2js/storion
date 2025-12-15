/**
 * Storion store implementations for benchmarks
 */

import { store, container, effect } from "storion";

// Simple counter store
export function createStorionCounter() {
  const counterSpec = store({
    name: "counter",
    state: { count: 0 },
    setup: ({ state }) => ({
      increment: () => {
        state.count++;
      },
      decrement: () => {
        state.count--;
      },
      set: (value: number) => {
        state.count = value;
      },
    }),
  });

  const stores = container();
  return stores.get(counterSpec);
}

// Large state store
export function createStorionLargeState(size: number) {
  const initialState: Record<string, number> = {};
  for (let i = 0; i < size; i++) {
    initialState[`prop${i}`] = i;
  }

  const largeSpec = store({
    name: "large",
    state: initialState,
    setup: ({ state }) => ({
      update: (key: string, value: number) => {
        (state as Record<string, number>)[key] = value;
      },
      batchUpdate: (updates: Record<string, number>) => {
        for (const [key, value] of Object.entries(updates)) {
          (state as Record<string, number>)[key] = value;
        }
      },
    }),
  });

  const stores = container();
  return stores.get(largeSpec);
}

// Derived/computed store
export function createStorionDerived() {
  const baseSpec = store({
    name: "base",
    state: { a: 1, b: 2 },
    setup: ({ state }) => ({
      setA: (value: number) => {
        state.a = value;
      },
      setB: (value: number) => {
        state.b = value;
      },
    }),
  });

  const derivedSpec = store({
    name: "derived",
    state: { sum: 0, product: 0 },
    setup: ({ state, resolve: get }) => {
      const [base] = get(baseSpec);

      effect(() => {
        state.sum = base.a + base.b;
        state.product = base.a * base.b;
      });

      return {};
    },
  });

  const stores = container();
  const base = stores.get(baseSpec);
  const derived = stores.get(derivedSpec);

  return { base, derived };
}

// Store with many subscribers
export function createStorionWithSubscribers(subscriberCount: number) {
  const spec = store({
    name: "subscribed",
    state: { value: 0 },
    setup: ({ state }) => ({
      increment: () => {
        state.value++;
      },
    }),
  });

  const stores = container();
  const instance = stores.get(spec);

  const unsubscribes: VoidFunction[] = [];
  for (let i = 0; i < subscriberCount; i++) {
    unsubscribes.push(instance.subscribe("value", () => {}));
  }

  return {
    instance,
    cleanup: () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    },
  };
}
