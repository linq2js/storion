/**
 * Devtools types for storion.
 */

import type { StoreInstance } from "../types";

// =============================================================================
// Event Types
// =============================================================================

/**
 * Types of events tracked by devtools.
 */
export type DevtoolsEventType =
  | "change"
  | "create"
  | "dispose"
  | "dispatch"
  | "error";

/**
 * A devtools event entry.
 */
export interface DevtoolsEvent {
  /** Unique event ID */
  id: number;
  /** Timestamp when event occurred */
  timestamp: number;
  /** Event type */
  type: DevtoolsEventType;
  /** Target - "window" or store ID */
  target: string;
  /** Extra info (action name, error message, changed keys, etc.) */
  extra?: string;
  /** Full data for copy (error stack, state diff, etc.) */
  data?: unknown;
}

// =============================================================================
// Snapshot Types
// =============================================================================

/**
 * A snapshot of store state at a point in time.
 */
export interface StateSnapshot {
  /** Unique snapshot ID */
  id: number;
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** The state at this point */
  state: Record<string, unknown>;
  /** Action that triggered this change (if any) */
  action?: string;
  /** Arguments passed to the action */
  actionArgs?: unknown[];
}

/**
 * Store entry in devtools.
 */
export interface DevtoolsStoreEntry {
  /** Store ID */
  id: string;
  /** Store spec name */
  name: string;
  /** Current state */
  state: Record<string, unknown>;
  /** State history (last N snapshots) */
  history: StateSnapshot[];
  /** Code location where spec was defined (if available) */
  codeLocation?: string;
  /** Whether the store is disposed */
  disposed: boolean;
  /** Store instance reference */
  instance: StoreInstance<any, any>;
  /** Timestamp when store was created */
  createdAt: number;
  /** Store meta from spec options */
  meta?: Record<string, unknown>;
}

/**
 * Devtools controller exposed to window.
 */
export interface DevtoolsController {
  /** Version of the devtools */
  version: string;

  /** Get all tracked stores */
  getStores(): DevtoolsStoreEntry[];

  /** Get a specific store by ID */
  getStore(id: string): DevtoolsStoreEntry | undefined;

  /** Revert a store to a specific snapshot */
  revertToSnapshot(storeId: string, snapshotId: number): boolean;

  /** Take a manual snapshot of a store */
  takeSnapshot(storeId: string): StateSnapshot | undefined;

  /** Clear history for a store */
  clearHistory(storeId: string): void;

  /** Clear all stores and history */
  clear(): void;

  /** Subscribe to store changes */
  subscribe(listener: () => void): () => void;

  /** Max history entries per store */
  maxHistory: number;

  // Event-related methods
  /** Get all tracked events */
  getEvents(): DevtoolsEvent[];

  /** Clear all events */
  clearEvents(): void;

  /** Record an event */
  recordEvent(
    type: DevtoolsEventType,
    target: string,
    extra?: string,
    data?: unknown
  ): void;

  /** Max events to keep */
  maxEvents: number;
}

/**
 * Devtools middleware options.
 */
export interface DevtoolsMiddlewareOptions {
  /** Name for the devtools instance (default: "storion") */
  name?: string;
  /** Maximum history entries per store (default: 5) */
  maxHistory?: number;
  /** Whether to capture code location (default: true in dev) */
  captureLocation?: boolean;
  /** Custom window object (for testing) */
  windowObject?: typeof globalThis;
}

/**
 * Internal actions injected by devtools middleware.
 */
export interface DevtoolsActions {
  /** Revert state to a previous snapshot */
  __revertState: (newState: Record<string, unknown>) => void;
  /** Take a snapshot of current state */
  __takeSnapshot: () => void;
}

declare global {
  interface Window {
    __STORION_DEVTOOLS__?: DevtoolsController;
  }
}

