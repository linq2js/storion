/**
 * RxJS store implementations for benchmarks
 */

import { BehaviorSubject, combineLatest, map } from "rxjs";

// Simple counter store
export function createRxJSCounter() {
  const count$ = new BehaviorSubject(0);

  return {
    count$,
    increment: () => count$.next(count$.getValue() + 1),
    decrement: () => count$.next(count$.getValue() - 1),
    set: (value: number) => count$.next(value),
    getState: () => ({ count: count$.getValue() }),
  };
}

// Large state store
export function createRxJSLargeState(size: number) {
  const state: Record<string, BehaviorSubject<number>> = {};
  for (let i = 0; i < size; i++) {
    state[`prop${i}`] = new BehaviorSubject(i);
  }

  return {
    state,
    update: (key: string, value: number) => {
      state[key]?.next(value);
    },
    batchUpdate: (updates: Record<string, number>) => {
      for (const [key, value] of Object.entries(updates)) {
        state[key]?.next(value);
      }
    },
    getState: () => {
      const result: Record<string, number> = {};
      for (const [key, subject] of Object.entries(state)) {
        result[key] = subject.getValue();
      }
      return result;
    },
  };
}

// Derived/computed store
export function createRxJSDerived() {
  const a$ = new BehaviorSubject(1);
  const b$ = new BehaviorSubject(2);

  const sum$ = combineLatest([a$, b$]).pipe(map(([a, b]) => a + b));
  const product$ = combineLatest([a$, b$]).pipe(map(([a, b]) => a * b));

  // Subscribe to keep derived values hot
  let sumValue = 3;
  let productValue = 2;
  sum$.subscribe((v) => (sumValue = v));
  product$.subscribe((v) => (productValue = v));

  return {
    a$,
    b$,
    sum$,
    product$,
    setA: (value: number) => a$.next(value),
    setB: (value: number) => b$.next(value),
    getDerived: () => ({ sum: sumValue, product: productValue }),
  };
}

// Store with many subscribers
export function createRxJSWithSubscribers(subscriberCount: number) {
  const value$ = new BehaviorSubject(0);

  const subscriptions: { unsubscribe: () => void }[] = [];
  for (let i = 0; i < subscriberCount; i++) {
    subscriptions.push(value$.subscribe(() => {}));
  }

  return {
    value$,
    increment: () => value$.next(value$.getValue() + 1),
    getState: () => ({ value: value$.getValue() }),
    cleanup: () => {
      for (const sub of subscriptions) {
        sub.unsubscribe();
      }
    },
  };
}

