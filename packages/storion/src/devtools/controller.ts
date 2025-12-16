/**
 * Devtools controller implementation.
 */

import { emitter } from "../emitter";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
  DevtoolsEvent,
  DevtoolsEventType,
  StateSnapshot,
} from "./types";

let snapshotIdCounter = 0;
let eventIdCounter = 0;

const DEFAULT_MAX_EVENTS = 200;

export function createDevtoolsController(
  maxHistory: number = 5
): DevtoolsController {
  const stores = new Map<string, DevtoolsStoreEntry>();
  const events: DevtoolsEvent[] = [];
  const changeEmitter = emitter<void>();

  const notifyChange = () => {
    changeEmitter.emit();
  };

  const addEvent = (
    type: DevtoolsEventType,
    target: string,
    extra?: string,
    data?: unknown
  ) => {
    events.push({
      id: ++eventIdCounter,
      timestamp: Date.now(),
      type,
      target,
      extra,
      data,
    });
    // Trim events if over limit
    while (events.length > controller.maxEvents) {
      events.shift();
    }
    notifyChange();
  };

  const controller: DevtoolsController = {
    version: "1.0.0",
    maxHistory,
    maxEvents: DEFAULT_MAX_EVENTS,

    getStores(): DevtoolsStoreEntry[] {
      return Array.from(stores.values());
    },

    getStore(id: string): DevtoolsStoreEntry | undefined {
      return stores.get(id);
    },

    getEvents(): DevtoolsEvent[] {
      return [...events];
    },

    clearEvents(): void {
      events.length = 0;
      notifyChange();
    },

    recordEvent(
      type: DevtoolsEventType,
      target: string,
      extra?: string,
      data?: unknown
    ): void {
      addEvent(type, target, extra, data);
    },

    revertToSnapshot(storeId: string, snapshotId: number): boolean {
      const entry = stores.get(storeId);
      if (!entry) return false;

      const snapshotIndex = entry.history.findIndex((s) => s.id === snapshotId);
      if (snapshotIndex === -1) return false;

      const snapshot = entry.history[snapshotIndex];

      // Call the injected __revertState action
      const actions = entry.instance.actions as any;
      if (typeof actions.__revertState === "function") {
        // Remove the reverted snapshot and all newer ones
        entry.history = entry.history.slice(0, snapshotIndex);

        // Perform the revert
        actions.__revertState(snapshot.state);

        // A new snapshot will be added by the state change subscription
        // with the reverted state

        notifyChange();
        return true;
      }
      return false;
    },

    takeSnapshot(storeId: string): StateSnapshot | undefined {
      const entry = stores.get(storeId);
      if (!entry) return undefined;

      const snapshot = createSnapshot(entry.instance.state, "manual");
      addSnapshot(entry, snapshot);
      notifyChange();
      return snapshot;
    },

    clearHistory(storeId: string): void {
      const entry = stores.get(storeId);
      if (entry) {
        entry.history = [];
        notifyChange();
      }
    },

    clear(): void {
      stores.clear();
      notifyChange();
    },

    subscribe(listener: () => void): () => void {
      return changeEmitter.on(listener);
    },
  };

  // Internal methods for middleware
  (controller as any)._registerStore = (
    entry: Omit<DevtoolsStoreEntry, "history">
  ) => {
    const fullEntry: DevtoolsStoreEntry = {
      ...entry,
      history: [],
    };
    // Take initial snapshot
    const snapshot = createSnapshot(entry.state, "init");
    fullEntry.history.push(snapshot);
    stores.set(entry.id, fullEntry);
    // Record create event
    addEvent("create", entry.id, entry.name);
    notifyChange();
  };

  (controller as any)._unregisterStore = (id: string) => {
    if (stores.has(id)) {
      // Record dispose event
      addEvent("dispose", id);
      stores.delete(id);
      notifyChange();
    }
  };

  (controller as any)._recordStateChange = (
    id: string,
    state: Record<string, unknown>,
    action?: string,
    actionArgs?: unknown[]
  ) => {
    const entry = stores.get(id);
    if (!entry) return;

    // Calculate changed keys for event
    const changedKeys: string[] = [];
    for (const key of Object.keys(state)) {
      if (entry.state[key] !== state[key]) {
        changedKeys.push(key);
      }
    }

    entry.state = state;
    const snapshot = createSnapshot(state, action, actionArgs);
    addSnapshot(entry, snapshot);

    // Record appropriate event
    if (action) {
      addEvent("dispatch", id, action, { args: actionArgs, changed: changedKeys });
    } else {
      addEvent("change", id, changedKeys.join(", "), { changed: changedKeys });
    }
    notifyChange();
  };

  function createSnapshot(
    state: Record<string, unknown>,
    action?: string,
    actionArgs?: unknown[]
  ): StateSnapshot {
    return {
      id: ++snapshotIdCounter,
      timestamp: Date.now(),
      state: { ...state }, // Shallow copy
      action,
      actionArgs,
    };
  }

  function addSnapshot(entry: DevtoolsStoreEntry, snapshot: StateSnapshot) {
    entry.history.push(snapshot);
    // Keep only last N snapshots
    while (entry.history.length > controller.maxHistory) {
      entry.history.shift();
    }
  }

  return controller;
}

