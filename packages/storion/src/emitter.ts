import { Listener, SingleOrMultipleListeners } from "./types";

/**
 * Event emitter interface for pub/sub pattern.
 *
 * @template T - The type of payload emitted to listeners (defaults to void)
 */
export interface Emitter<T = void> {
  /**
   * Subscribe to events with one or more listeners.
   *
   * @param listeners - Single listener or array of listeners
   * @returns Unsubscribe function (idempotent - safe to call multiple times)
   */
  on(listeners: SingleOrMultipleListeners<T>): VoidFunction;

  /**
   * Subscribe with a mapping function that filters and transforms events.
   *
   * The map function receives the emitted value and returns either:
   * - `{ value: TValue }` - Listener is called with the transformed value
   * - `undefined` - Listener is NOT called (event filtered out)
   *
   * @template TValue - The transformed value type passed to listeners
   * @param map - Transform function that can filter (return undefined) or map values
   * @param listeners - Single listener or array of listeners for transformed values
   * @returns Unsubscribe function
   *
   * @example Filter and transform
   * ```ts
   * const emitter = emitter<{ type: string; data: number }>();
   *
   * // Only listen to 'success' events, extract just the data
   * emitter.on(
   *   (event) => event.type === 'success' ? { value: event.data } : undefined,
   *   (data) => console.log('Success data:', data)
   * );
   * ```
   */
  on<TValue>(
    map: (value: T) => { value: TValue } | undefined,
    listeners: SingleOrMultipleListeners<TValue>
  ): VoidFunction;

  /**
   * Emit an event to all registered listeners.
   *
   * @param payload - The value to pass to all listeners
   */
  emit(payload: T): void;

  /**
   * Remove all registered listeners.
   */
  clear(): void;

  /**
   * Emit an event to all listeners, then clear all listeners.
   * Useful for one-time events like disposal.
   *
   * @param payload - The value to pass to all listeners
   */
  emitAndClear(payload: T): void;

  /**
   * Emit to all listeners, clear, and "settle" the emitter.
   *
   * After settling:
   * - Any new `on()` call immediately invokes the listener with the settled payload
   * - Returns a no-op unsubscribe function
   * - `emit()` and `emitAndClear()` become no-ops
   *
   * Useful for one-time events where late subscribers should still receive the value
   * (similar to Promise behavior).
   *
   * @param payload - The final value to pass to all listeners
   */
  settle(payload: T): void;

  /** Number of registered listeners */
  readonly size: number;

  /** Whether the emitter has been settled */
  readonly settled: boolean;
}

/**
 * Creates an event emitter for managing and notifying listeners.
 *
 * An emitter provides a simple pub/sub pattern for managing event listeners.
 * It's used internally by signals and effects to manage subscriptions and notifications.
 *
 * Features:
 * - Add listeners that will be notified when events are emitted
 * - Emit events to all registered listeners
 * - Remove listeners via unsubscribe functions
 * - Clear all listeners at once
 * - Safe to call unsubscribe multiple times (idempotent)
 *
 * @template T - The type of payload that will be emitted to listeners (defaults to void)
 * @returns An emitter object with add, emit, and clear methods
 *
 * @example
 * ```ts
 * const eventEmitter = emitter<string>();
 *
 * // Subscribe to events
 * const unsubscribe = eventEmitter.add((message) => {
 *   console.log('Received:', message);
 * });
 *
 * // Emit an event
 * eventEmitter.emit('Hello'); // Logs: "Received: Hello"
 *
 * // Unsubscribe
 * unsubscribe();
 *
 * // Clear all listeners
 * eventEmitter.clear();
 * ```
 */
export function emitter<T = void>(
  initialListeners?: Listener<T>[]
): Emitter<T> {
  /**
   * Set of registered listeners that will be notified when events are emitted.
   * Using a Set provides O(1) removal and prevents duplicate listeners.
   */
  const listeners = new Set<Listener<T>>(initialListeners ?? []);

  /** Settled state - once settled, late subscribers get the payload immediately */
  let settledPayload: T | undefined;
  let isSettled = false;

  const noop = () => {};

  // Internal emit - always executes (doesn't check isSettled)
  const doEmit = (payload: T, clear: boolean) => {
    // Create snapshot - necessary because Set.forEach includes items added during iteration
    const copy = Array.from(listeners);
    if (clear) {
      listeners.clear();
    }
    // Use traditional for loop for maximum performance in this hot path
    const len = copy.length;
    for (let i = 0; i < len; i++) {
      copy[i](payload);
    }
  };

  return {
    get size() {
      return listeners.size;
    },
    get settled() {
      return isSettled;
    },
    /**
     * Adds one or more listeners to the emitter.
     *
     * The listener(s) will be called whenever `emit()` is called.
     * Returns an unsubscribe function that removes the listener(s).
     *
     * **Important**: The unsubscribe function is idempotent - calling it multiple
     * times is safe and won't cause errors. If the same listener is added multiple
     * times, it will only be called once per emit (Set deduplication).
     *
     * **Settled behavior**: If the emitter is settled, listeners are called
     * immediately with the settled payload and a no-op unsubscribe is returned.
     *
     * @param newListeners - Single listener or array of listeners to add
     * @returns An unsubscribe function that removes the listener(s)
     */
    on(...args: any[]): VoidFunction {
      let newListeners: Listener<T>[] = [];
      if (args.length < 2) {
        newListeners = Array.isArray(args[0]) ? args[0] : [args[0]];
      } else {
        const map = args[0] as (value: T) => { value: any } | undefined;
        const sourceListeners: Listener<any>[] = Array.isArray(args[1])
          ? args[1]
          : [args[1]];
        newListeners = [
          (value) => {
            const mappedValue = map(value);

            if (mappedValue) {
              for (const listener of sourceListeners) {
                listener(mappedValue.value);
              }
            }
          },
        ];
      }

      // If settled, call listeners immediately and return no-op
      if (isSettled) {
        for (const listener of newListeners) {
          listener(settledPayload as T);
        }
        return noop;
      }

      for (const listener of newListeners) {
        listeners.add(listener);
      }

      return () => {
        for (const listener of newListeners) {
          listeners.delete(listener);
        }
      };
    },
    /**
     * Emits an event to all registered listeners.
     *
     * **Important**: Creates a snapshot of listeners before iterating to ensure
     * that modifications during emission (adding/removing listeners) don't affect
     * the current emission cycle. This prevents:
     * - New listeners added during emission from being called immediately
     * - Issues with listeners that unsubscribe during emission
     *
     * Performance: For typical use cases (< 20 listeners), Array.from() overhead
     * is negligible compared to calling the listener functions themselves.
     *
     * **Settled behavior**: After `settle()` is called, `emit()` becomes a no-op.
     *
     * @param payload - The value to pass to all listeners
     */
    emit(payload: T): void {
      if (isSettled) return;
      doEmit(payload, false);
    },
    /**
     * Removes all registered listeners.
     *
     * After calling `clear()`, no listeners will be notified until new ones
     * are added via `on()`.
     */
    clear(): void {
      listeners.clear();
    },

    /**
     * Emits an event to all registered listeners and then clears all listeners.
     *
     * **Settled behavior**: After `settle()` is called, `emitAndClear()` becomes a no-op.
     *
     * @param payload - The value to pass to all listeners
     */
    emitAndClear(payload: T): void {
      if (isSettled) return;
      doEmit(payload, true);
    },

    /**
     * Emit to all listeners, clear, and "settle" the emitter.
     *
     * After settling:
     * - Any new `on()` call immediately invokes the listener with the settled payload
     * - Returns a no-op unsubscribe function
     * - `emit()` and `emitAndClear()` become no-ops
     *
     * **Important**: `isSettled` is set BEFORE emitting so that listeners
     * added during emission see the settled state and get called immediately.
     *
     * @param payload - The final value to pass to all listeners
     */
    settle(payload: T): void {
      if (isSettled) return;
      settledPayload = payload;
      isSettled = true;
      doEmit(payload, true);
    },
  };
}
