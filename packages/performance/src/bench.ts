/**
 * Performance Benchmark Suite
 *
 * Compares Storion with Zustand, Redux Toolkit, and RxJS
 */

import { benchmark, printResults, BenchmarkResult } from "./benchmark";
import {
  createStorionCounter,
  createStorionLargeState,
  createStorionDerived,
  createStorionWithSubscribers,
} from "./stores/storion";
import {
  createZustandCounter,
  createZustandLargeState,
  createZustandDerived,
  createZustandWithSubscribers,
} from "./stores/zustand";
import {
  createReduxCounter,
  createReduxLargeState,
  createReduxDerived,
  createReduxWithSubscribers,
} from "./stores/redux";
import {
  createRxJSCounter,
  createRxJSLargeState,
  createRxJSDerived,
  createRxJSWithSubscribers,
} from "./stores/rxjs";

const ITERATIONS = 50000;

async function main() {
  console.log("🚀 Starting Performance Benchmark Suite");
  console.log(`   Iterations per test: ${ITERATIONS.toLocaleString()}\n`);

  const results: BenchmarkResult[] = [];

  // ==========================================================================
  // Benchmark 1: Simple State Updates
  // ==========================================================================
  console.log("Running: Simple State Updates...");

  // Storion
  const storionCounter = createStorionCounter();
  results.push(
    await benchmark(
      "Simple State Update",
      "Storion",
      () => storionCounter.actions.increment(),
      { iterations: ITERATIONS }
    )
  );

  // Zustand
  const zustandCounter = createZustandCounter();
  results.push(
    await benchmark(
      "Simple State Update",
      "Zustand",
      () => zustandCounter.getState().increment(),
      { iterations: ITERATIONS }
    )
  );

  // Redux
  const { store: reduxCounter, actions: counterActions } = createReduxCounter();
  results.push(
    await benchmark(
      "Simple State Update",
      "Redux",
      () => reduxCounter.dispatch(counterActions.increment()),
      { iterations: ITERATIONS }
    )
  );

  // RxJS
  const rxjsCounter = createRxJSCounter();
  results.push(
    await benchmark(
      "Simple State Update",
      "RxJS",
      () => rxjsCounter.increment(),
      {
        iterations: ITERATIONS,
      }
    )
  );

  // ==========================================================================
  // Benchmark 2: Large State Object Updates
  // ==========================================================================
  console.log("Running: Large State Object Updates...");

  const LARGE_STATE_SIZE = 100;

  // Storion
  const storionLarge = createStorionLargeState(LARGE_STATE_SIZE);
  let storionKey = 0;
  results.push(
    await benchmark(
      "Large State Update (100 props)",
      "Storion",
      () => {
        storionLarge.actions.update(
          `prop${storionKey++ % LARGE_STATE_SIZE}`,
          storionKey
        );
      },
      { iterations: ITERATIONS }
    )
  );

  // Zustand
  const zustandLarge = createZustandLargeState(LARGE_STATE_SIZE);
  let zustandKey = 0;
  results.push(
    await benchmark(
      "Large State Update (100 props)",
      "Zustand",
      () => {
        const key = `prop${zustandKey++ % LARGE_STATE_SIZE}`;
        zustandLarge.getState().update(key, zustandKey);
      },
      { iterations: ITERATIONS }
    )
  );

  // Redux
  const { store: reduxLarge, actions: largeActions } =
    createReduxLargeState(LARGE_STATE_SIZE);
  let reduxKey = 0;
  results.push(
    await benchmark(
      "Large State Update (100 props)",
      "Redux",
      () => {
        reduxLarge.dispatch(
          largeActions.update({
            key: `prop${reduxKey++ % LARGE_STATE_SIZE}`,
            value: reduxKey,
          })
        );
      },
      { iterations: ITERATIONS }
    )
  );

  // RxJS
  const rxjsLarge = createRxJSLargeState(LARGE_STATE_SIZE);
  let rxjsKey = 0;
  results.push(
    await benchmark(
      "Large State Update (100 props)",
      "RxJS",
      () => {
        rxjsLarge.update(`prop${rxjsKey++ % LARGE_STATE_SIZE}`, rxjsKey);
      },
      { iterations: ITERATIONS }
    )
  );

  // ==========================================================================
  // Benchmark 3: Batch Updates
  // ==========================================================================
  console.log("Running: Batch Updates...");

  const BATCH_SIZE = 10;
  const batchUpdates: Record<string, number> = {};
  for (let i = 0; i < BATCH_SIZE; i++) {
    batchUpdates[`prop${i}`] = i * 2;
  }

  // Storion (recreate for clean state)
  const storionBatch = createStorionLargeState(LARGE_STATE_SIZE);
  results.push(
    await benchmark(
      "Batch Update (10 props)",
      "Storion",
      () => storionBatch.actions.batchUpdate(batchUpdates),
      { iterations: ITERATIONS / 10 }
    )
  );

  // Zustand
  const zustandBatch = createZustandLargeState(LARGE_STATE_SIZE);
  results.push(
    await benchmark(
      "Batch Update (10 props)",
      "Zustand",
      () => zustandBatch.getState().batchUpdate(batchUpdates),
      { iterations: ITERATIONS / 10 }
    )
  );

  // Redux
  const { store: reduxBatch, actions: batchActions } =
    createReduxLargeState(LARGE_STATE_SIZE);
  results.push(
    await benchmark(
      "Batch Update (10 props)",
      "Redux",
      () => reduxBatch.dispatch(batchActions.batchUpdate(batchUpdates)),
      { iterations: ITERATIONS / 10 }
    )
  );

  // RxJS
  const rxjsBatch = createRxJSLargeState(LARGE_STATE_SIZE);
  results.push(
    await benchmark(
      "Batch Update (10 props)",
      "RxJS",
      () => rxjsBatch.batchUpdate(batchUpdates),
      { iterations: ITERATIONS / 10 }
    )
  );

  // ==========================================================================
  // Benchmark 4: Derived/Computed Values
  // ==========================================================================
  console.log("Running: Derived/Computed Values...");

  // Storion
  const { base: storionBase, derived: storionDerived } = createStorionDerived();
  let storionDerivedVal = 0;
  results.push(
    await benchmark(
      "Derived Value Update",
      "Storion",
      () => {
        storionBase.actions.setA(storionDerivedVal++);
        // Access derived to ensure it's computed
        void storionDerived.state.sum;
      },
      { iterations: ITERATIONS / 5 }
    )
  );

  // Zustand
  const { base: zustandBase, derived: zustandDerivedStore } =
    createZustandDerived();
  let zustandDerivedVal = 0;
  results.push(
    await benchmark(
      "Derived Value Update",
      "Zustand",
      () => {
        zustandBase.getState().setA(zustandDerivedVal++);
        void zustandDerivedStore.getState().sum;
      },
      { iterations: ITERATIONS / 5 }
    )
  );

  // Redux (selectors compute on access)
  const {
    store: reduxDerived,
    actions: derivedActions,
    selectSum,
  } = createReduxDerived();
  let reduxDerivedVal = 0;
  results.push(
    await benchmark(
      "Derived Value Update",
      "Redux",
      () => {
        reduxDerived.dispatch(derivedActions.setA(reduxDerivedVal++));
        void selectSum(reduxDerived.getState());
      },
      { iterations: ITERATIONS / 5 }
    )
  );

  // RxJS
  const rxjsDerived = createRxJSDerived();
  let rxjsDerivedVal = 0;
  results.push(
    await benchmark(
      "Derived Value Update",
      "RxJS",
      () => {
        rxjsDerived.setA(rxjsDerivedVal++);
        void rxjsDerived.getDerived().sum;
      },
      { iterations: ITERATIONS / 5 }
    )
  );

  // ==========================================================================
  // Benchmark 5: Many Subscribers
  // ==========================================================================
  console.log("Running: Many Subscribers...");

  const SUBSCRIBER_COUNT = 100;

  // Storion
  const { instance: storionSubscribed, cleanup: cleanupStorion } =
    createStorionWithSubscribers(SUBSCRIBER_COUNT);
  results.push(
    await benchmark(
      `Update with ${SUBSCRIBER_COUNT} Subscribers`,
      "Storion",
      () => storionSubscribed.actions.increment(),
      { iterations: ITERATIONS / 10 }
    )
  );
  cleanupStorion();

  // Zustand
  const { store: zustandSubscribed, cleanup: cleanupZustand } =
    createZustandWithSubscribers(SUBSCRIBER_COUNT);
  results.push(
    await benchmark(
      `Update with ${SUBSCRIBER_COUNT} Subscribers`,
      "Zustand",
      () => zustandSubscribed.getState().increment(),
      { iterations: ITERATIONS / 10 }
    )
  );
  cleanupZustand();

  // Redux
  const {
    store: reduxSubscribed,
    actions: subActions,
    cleanup: cleanupRedux,
  } = createReduxWithSubscribers(SUBSCRIBER_COUNT);
  results.push(
    await benchmark(
      `Update with ${SUBSCRIBER_COUNT} Subscribers`,
      "Redux",
      () => reduxSubscribed.dispatch(subActions.increment()),
      { iterations: ITERATIONS / 10 }
    )
  );
  cleanupRedux();

  // RxJS
  const { increment: rxjsIncrement, cleanup: cleanupRxjs } =
    createRxJSWithSubscribers(SUBSCRIBER_COUNT);
  results.push(
    await benchmark(
      `Update with ${SUBSCRIBER_COUNT} Subscribers`,
      "RxJS",
      () => rxjsIncrement(),
      { iterations: ITERATIONS / 10 }
    )
  );
  cleanupRxjs();

  // ==========================================================================
  // Benchmark 6: State Read Performance
  // ==========================================================================
  console.log("Running: State Read Performance...");

  // Storion
  const storionRead = createStorionCounter();
  results.push(
    await benchmark(
      "State Read",
      "Storion",
      () => {
        void storionRead.state.count;
      },
      { iterations: ITERATIONS * 2 }
    )
  );

  // Zustand
  const zustandRead = createZustandCounter();
  results.push(
    await benchmark(
      "State Read",
      "Zustand",
      () => {
        void zustandRead.getState().count;
      },
      { iterations: ITERATIONS * 2 }
    )
  );

  // Redux
  const { store: reduxRead } = createReduxCounter();
  results.push(
    await benchmark(
      "State Read",
      "Redux",
      () => {
        void reduxRead.getState().count;
      },
      { iterations: ITERATIONS * 2 }
    )
  );

  // RxJS
  const rxjsRead = createRxJSCounter();
  results.push(
    await benchmark(
      "State Read",
      "RxJS",
      () => {
        void rxjsRead.getState().count;
      },
      { iterations: ITERATIONS * 2 }
    )
  );

  // ==========================================================================
  // Print Results
  // ==========================================================================
  printResults(results);

  console.log("\n✅ Benchmark completed!");
}

main().catch(console.error);
