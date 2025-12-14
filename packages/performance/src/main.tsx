/**
 * Performance Benchmark Web UI
 */

import { benchmark, BenchmarkResult } from "./benchmark";
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

const ITERATIONS = 20000;
const LARGE_STATE_SIZE = 100;
const BATCH_SIZE = 10;
const SUBSCRIBER_COUNT = 100;

const runBtn = document.getElementById("runBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;
const progressBar = document.querySelector(".progress-bar") as HTMLDivElement;
const progressFill = document.querySelector(".progress-bar-fill") as HTMLDivElement;

function setStatus(message: string, loading = false) {
  statusEl.innerHTML = loading
    ? `<span class="loading"></span>${message}`
    : message;
}

function setProgress(percent: number) {
  progressBar.style.display = "block";
  progressFill.style.width = `${percent}%`;
}

function renderResults(groupedResults: Map<string, BenchmarkResult[]>) {
  resultsEl.innerHTML = "";

  for (const [name, benchResults] of groupedResults) {
    const card = document.createElement("div");
    card.className = "benchmark-card";

    // Sort by ops/sec
    benchResults.sort((a, b) => b.opsPerSec - a.opsPerSec);
    const fastest = benchResults[0];

    card.innerHTML = `
      <h2>${name}</h2>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Library</th>
            <th>Ops/sec</th>
            <th>Avg (ms)</th>
            <th>Min (ms)</th>
            <th>Max (ms)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${benchResults
            .map((result) => {
              const isFastest = result === fastest;
              const slowerPercent = isFastest
                ? 0
                : ((fastest.opsPerSec / result.opsPerSec - 1) * 100).toFixed(1);
              const libraryClass = `library-${result.library.toLowerCase()}`;

              return `
                <tr>
                  <td class="library-name ${libraryClass}">${result.library}</td>
                  <td class="ops-value">${result.opsPerSec.toLocaleString()}</td>
                  <td>${result.avgTime.toFixed(4)}</td>
                  <td>${result.minTime.toFixed(4)}</td>
                  <td>${result.maxTime.toFixed(4)}</td>
                  <td>
                    ${
                      isFastest
                        ? '<span class="badge badge-fastest">🏆 fastest</span>'
                        : `<span class="badge badge-slower">${slowerPercent}% slower</span>`
                    }
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    resultsEl.appendChild(card);
  }
}

async function runBenchmarks() {
  runBtn.disabled = true;
  resultsEl.innerHTML = "";
  const results: BenchmarkResult[] = [];
  const totalTests = 24; // 6 benchmarks * 4 libraries
  let completedTests = 0;

  const updateProgress = () => {
    completedTests++;
    setProgress((completedTests / totalTests) * 100);
  };

  try {
    // ==========================================================================
    // Benchmark 1: Simple State Updates
    // ==========================================================================
    setStatus("Running: Simple State Updates...", true);
    await new Promise((r) => setTimeout(r, 50));

    const storionCounter = createStorionCounter();
    results.push(
      await benchmark("Simple State Update", "Storion", () =>
        storionCounter.actions.increment(), { iterations: ITERATIONS }
      )
    );
    updateProgress();

    const zustandCounter = createZustandCounter();
    results.push(
      await benchmark("Simple State Update", "Zustand", () =>
        zustandCounter.getState().increment(), { iterations: ITERATIONS }
      )
    );
    updateProgress();

    const { store: reduxCounter, actions: counterActions } = createReduxCounter();
    results.push(
      await benchmark("Simple State Update", "Redux", () =>
        reduxCounter.dispatch(counterActions.increment()), { iterations: ITERATIONS }
      )
    );
    updateProgress();

    const rxjsCounter = createRxJSCounter();
    results.push(
      await benchmark("Simple State Update", "RxJS", () =>
        rxjsCounter.increment(), { iterations: ITERATIONS }
      )
    );
    updateProgress();

    // ==========================================================================
    // Benchmark 2: Large State Object Updates
    // ==========================================================================
    setStatus("Running: Large State Object Updates...", true);
    await new Promise((r) => setTimeout(r, 50));

    const storionLarge = createStorionLargeState(LARGE_STATE_SIZE);
    let storionKey = 0;
    results.push(
      await benchmark("Large State Update", "Storion", () => {
        storionLarge.actions.update(`prop${storionKey++ % LARGE_STATE_SIZE}`, storionKey);
      }, { iterations: ITERATIONS })
    );
    updateProgress();

    const zustandLarge = createZustandLargeState(LARGE_STATE_SIZE);
    let zustandKey = 0;
    results.push(
      await benchmark("Large State Update", "Zustand", () => {
        zustandLarge.getState().update(`prop${zustandKey++ % LARGE_STATE_SIZE}`, zustandKey);
      }, { iterations: ITERATIONS })
    );
    updateProgress();

    const { store: reduxLarge, actions: largeActions } = createReduxLargeState(LARGE_STATE_SIZE);
    let reduxKey = 0;
    results.push(
      await benchmark("Large State Update", "Redux", () => {
        reduxLarge.dispatch(largeActions.update({
          key: `prop${reduxKey++ % LARGE_STATE_SIZE}`,
          value: reduxKey,
        }));
      }, { iterations: ITERATIONS })
    );
    updateProgress();

    const rxjsLarge = createRxJSLargeState(LARGE_STATE_SIZE);
    let rxjsKey = 0;
    results.push(
      await benchmark("Large State Update", "RxJS", () => {
        rxjsLarge.update(`prop${rxjsKey++ % LARGE_STATE_SIZE}`, rxjsKey);
      }, { iterations: ITERATIONS })
    );
    updateProgress();

    // ==========================================================================
    // Benchmark 3: Batch Updates
    // ==========================================================================
    setStatus("Running: Batch Updates...", true);
    await new Promise((r) => setTimeout(r, 50));

    const batchUpdates: Record<string, number> = {};
    for (let i = 0; i < BATCH_SIZE; i++) {
      batchUpdates[`prop${i}`] = i * 2;
    }

    const storionBatch = createStorionLargeState(LARGE_STATE_SIZE);
    results.push(
      await benchmark("Batch Update (10 props)", "Storion", () =>
        storionBatch.actions.batchUpdate(batchUpdates), { iterations: ITERATIONS / 5 }
      )
    );
    updateProgress();

    const zustandBatch = createZustandLargeState(LARGE_STATE_SIZE);
    results.push(
      await benchmark("Batch Update (10 props)", "Zustand", () =>
        zustandBatch.getState().batchUpdate(batchUpdates), { iterations: ITERATIONS / 5 }
      )
    );
    updateProgress();

    const { store: reduxBatch, actions: batchActions } = createReduxLargeState(LARGE_STATE_SIZE);
    results.push(
      await benchmark("Batch Update (10 props)", "Redux", () =>
        reduxBatch.dispatch(batchActions.batchUpdate(batchUpdates)), { iterations: ITERATIONS / 5 }
      )
    );
    updateProgress();

    const rxjsBatch = createRxJSLargeState(LARGE_STATE_SIZE);
    results.push(
      await benchmark("Batch Update (10 props)", "RxJS", () =>
        rxjsBatch.batchUpdate(batchUpdates), { iterations: ITERATIONS / 5 }
      )
    );
    updateProgress();

    // ==========================================================================
    // Benchmark 4: Derived Values
    // ==========================================================================
    setStatus("Running: Derived Values...", true);
    await new Promise((r) => setTimeout(r, 50));

    const { base: storionBase, derived: storionDerived } = createStorionDerived();
    let storionDerivedVal = 0;
    results.push(
      await benchmark("Derived Value Update", "Storion", () => {
        storionBase.actions.setA(storionDerivedVal++);
        void storionDerived.state.sum;
      }, { iterations: ITERATIONS / 5 })
    );
    updateProgress();

    const { base: zustandBase, derived: zustandDerivedStore } = createZustandDerived();
    let zustandDerivedVal = 0;
    results.push(
      await benchmark("Derived Value Update", "Zustand", () => {
        zustandBase.getState().setA(zustandDerivedVal++);
        void zustandDerivedStore.getState().sum;
      }, { iterations: ITERATIONS / 5 })
    );
    updateProgress();

    const { store: reduxDerived, actions: derivedActions, selectSum } = createReduxDerived();
    let reduxDerivedVal = 0;
    results.push(
      await benchmark("Derived Value Update", "Redux", () => {
        reduxDerived.dispatch(derivedActions.setA(reduxDerivedVal++));
        void selectSum(reduxDerived.getState());
      }, { iterations: ITERATIONS / 5 })
    );
    updateProgress();

    const rxjsDerived = createRxJSDerived();
    let rxjsDerivedVal = 0;
    results.push(
      await benchmark("Derived Value Update", "RxJS", () => {
        rxjsDerived.setA(rxjsDerivedVal++);
        void rxjsDerived.getDerived().sum;
      }, { iterations: ITERATIONS / 5 })
    );
    updateProgress();

    // ==========================================================================
    // Benchmark 5: Many Subscribers
    // ==========================================================================
    setStatus("Running: Many Subscribers...", true);
    await new Promise((r) => setTimeout(r, 50));

    const { instance: storionSubscribed, cleanup: cleanupStorion } =
      createStorionWithSubscribers(SUBSCRIBER_COUNT);
    results.push(
      await benchmark(`${SUBSCRIBER_COUNT} Subscribers`, "Storion", () =>
        storionSubscribed.actions.increment(), { iterations: ITERATIONS / 10 }
      )
    );
    cleanupStorion();
    updateProgress();

    const { store: zustandSubscribed, cleanup: cleanupZustand } =
      createZustandWithSubscribers(SUBSCRIBER_COUNT);
    results.push(
      await benchmark(`${SUBSCRIBER_COUNT} Subscribers`, "Zustand", () =>
        zustandSubscribed.getState().increment(), { iterations: ITERATIONS / 10 }
      )
    );
    cleanupZustand();
    updateProgress();

    const { store: reduxSubscribed, actions: subActions, cleanup: cleanupRedux } =
      createReduxWithSubscribers(SUBSCRIBER_COUNT);
    results.push(
      await benchmark(`${SUBSCRIBER_COUNT} Subscribers`, "Redux", () =>
        reduxSubscribed.dispatch(subActions.increment()), { iterations: ITERATIONS / 10 }
      )
    );
    cleanupRedux();
    updateProgress();

    const { increment: rxjsIncrement, cleanup: cleanupRxjs } =
      createRxJSWithSubscribers(SUBSCRIBER_COUNT);
    results.push(
      await benchmark(`${SUBSCRIBER_COUNT} Subscribers`, "RxJS", () =>
        rxjsIncrement(), { iterations: ITERATIONS / 10 }
      )
    );
    cleanupRxjs();
    updateProgress();

    // ==========================================================================
    // Benchmark 6: State Read
    // ==========================================================================
    setStatus("Running: State Read...", true);
    await new Promise((r) => setTimeout(r, 50));

    const storionRead = createStorionCounter();
    results.push(
      await benchmark("State Read", "Storion", () => {
        void storionRead.state.count;
      }, { iterations: ITERATIONS * 2 })
    );
    updateProgress();

    const zustandRead = createZustandCounter();
    results.push(
      await benchmark("State Read", "Zustand", () => {
        void zustandRead.getState().count;
      }, { iterations: ITERATIONS * 2 })
    );
    updateProgress();

    const { store: reduxRead } = createReduxCounter();
    results.push(
      await benchmark("State Read", "Redux", () => {
        void reduxRead.getState().count;
      }, { iterations: ITERATIONS * 2 })
    );
    updateProgress();

    const rxjsRead = createRxJSCounter();
    results.push(
      await benchmark("State Read", "RxJS", () => {
        void rxjsRead.getState().count;
      }, { iterations: ITERATIONS * 2 })
    );
    updateProgress();

    // ==========================================================================
    // Render Results
    // ==========================================================================
    const grouped = new Map<string, BenchmarkResult[]>();
    for (const result of results) {
      if (!grouped.has(result.name)) {
        grouped.set(result.name, []);
      }
      grouped.get(result.name)!.push(result);
    }

    renderResults(grouped);
    setStatus("✅ Benchmarks completed!");
    progressBar.style.display = "none";
  } catch (error) {
    setStatus(`❌ Error: ${error}`);
    console.error(error);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", runBenchmarks);

