/**
 * Devtools controller implementation.
 */

import { emitter } from "../emitter";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
  StateSnapshot,
} from "./types";

let snapshotIdCounter = 0;

export function createDevtoolsController(
  maxHistory: number = 5
): DevtoolsController {
  const stores = new Map<string, DevtoolsStoreEntry>();
  const changeEmitter = emitter<void>();

  const notifyChange = () => {
    changeEmitter.emit();
  };

  const controller: DevtoolsController = {
    version: "1.0.0",
    maxHistory,

    getStores(): DevtoolsStoreEntry[] {
      return Array.from(stores.values());
    },

    getStore(id: string): DevtoolsStoreEntry | undefined {
      return stores.get(id);
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
    notifyChange();
  };

  (controller as any)._unregisterStore = (id: string) => {
    const entry = stores.get(id);
    if (entry) {
      entry.disposed = true;
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

    entry.state = state;
    const snapshot = createSnapshot(state, action, actionArgs);
    addSnapshot(entry, snapshot);
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

