/**
 * Devtools Panel Component
 *
 * Renders in its own React root, separate from the main app.
 */

import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
  DevtoolsEvent,
  DevtoolsEventType,
} from "../devtools/types";
import { panelStyles } from "./styles";
import { SearchBar, TabContent, MainContent } from "./components/TabLayout";

// Tab type
type TabId = "stores" | "events";

// ============================================================================
// Settings Storage
// ============================================================================

const STORAGE_KEY = "storion-devtools-settings";

interface DevtoolsSettings {
  activeTab: TabId;
  collapsed: boolean;
  size: number;
  position: "left" | "bottom";
  storeSearchQuery: string;
  eventSearchQuery: string;
  eventFilters: DevtoolsEventType[] | null; // null = "All"
  sortByActivity: boolean; // Sort stores by recent activity
}

function loadSettings(): Partial<DevtoolsSettings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors (SSR, localStorage disabled, etc.)
  }
  return {};
}

function saveSettings(settings: Partial<DevtoolsSettings>): void {
  try {
    const current = loadSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore errors
  }
}

/** Clear all devtools settings from localStorage */
export function clearDevtoolsSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

// Hook to persist a single setting
function usePersistentState<T>(
  key: keyof DevtoolsSettings,
  initialValue: T,
  transform?: {
    toStorage?: (value: T) => unknown;
    fromStorage?: (stored: unknown) => T;
  }
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = loadSettings();
    if (key in stored) {
      const storedValue = stored[key];
      return transform?.fromStorage
        ? transform.fromStorage(storedValue)
        : (storedValue as T);
    }
    return initialValue;
  });

  // Persist to localStorage whenever value changes (skip initial mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const toStore = transform?.toStorage ? transform.toStorage(value) : value;
    saveSettings({ [key]: toStore });
  }, [value, key, transform]);

  return [value, setValue];
}

// ============================================================================
// Icons (inline SVG)
// ============================================================================

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{
      transform: open ? "rotate(90deg)" : "rotate(0)",
      transition: "transform 0.15s",
    }}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const IconMinimize = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Position icons
const IconDockLeft = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const IconDockBottom = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </svg>
);

const IconCopy = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconClear = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// Activity/clock icon for sort by recent activity
const IconActivity = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// Expand all icon (arrows pointing outward)
const IconExpandAll = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

// Collapse all icon (arrows pointing inward)
const IconCollapseAll = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

// ============================================================================
// Utility Functions
// ============================================================================

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatValue(value: unknown): { text: string; type: string } {
  if (value === null) return { text: "null", type: "null" };
  if (value === undefined) return { text: "undefined", type: "null" };
  if (typeof value === "string") return { text: `"${value}"`, type: "string" };
  if (typeof value === "number") return { text: String(value), type: "number" };
  if (typeof value === "boolean")
    return { text: String(value), type: "boolean" };
  if (Array.isArray(value))
    return { text: `Array(${value.length})`, type: "object" };
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return {
      text: `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}}`,
      type: "object",
    };
  }
  return { text: String(value), type: "unknown" };
}

// ============================================================================
// Store Entry Component
// ============================================================================

const DEFAULT_HISTORY_COUNT = 5;
const MAX_HISTORY_COUNT = 50;

interface StoreEntryProps {
  entry: DevtoolsStoreEntry;
  onRevert: (snapshotId: number) => void;
  flash?: boolean;
  forceExpanded?: boolean | null; // null = use local state, true/false = force
}

const StoreEntry = memo(function StoreEntry({
  entry,
  onRevert,
  flash = false,
  forceExpanded = null,
}: StoreEntryProps) {
  const [expanded, setExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Respond to external expand/collapse commands
  useEffect(() => {
    if (forceExpanded !== null) {
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // History display logic
  const totalHistory = entry.history.length;
  const hasMoreHistory = totalHistory > DEFAULT_HISTORY_COUNT;
  const displayCount = historyExpanded
    ? Math.min(totalHistory, MAX_HISTORY_COUNT)
    : Math.min(totalHistory, DEFAULT_HISTORY_COUNT);
  const displayHistory = entry.history.slice(-displayCount).reverse();

  // Get changed props by comparing with previous snapshot
  const getChangedProps = useCallback(
    (snapshotIndex: number): string[] => {
      const snapshot = entry.history[snapshotIndex];
      if (!snapshot) return [];

      // First snapshot - show all keys
      if (snapshotIndex === 0) {
        return Object.keys(snapshot.state);
      }

      const prevSnapshot = entry.history[snapshotIndex - 1];
      if (!prevSnapshot) return Object.keys(snapshot.state);

      const changedKeys: string[] = [];
      const allKeys = new Set([
        ...Object.keys(snapshot.state),
        ...Object.keys(prevSnapshot.state),
      ]);

      for (const key of allKeys) {
        const curr = snapshot.state[key];
        const prev = prevSnapshot.state[key];
        if (curr !== prev) {
          changedKeys.push(key);
        }
      }

      return changedKeys;
    },
    [entry.history]
  );

  // Get the actual index in history array for a snapshot
  const getSnapshotIndex = useCallback(
    (snapshotId: number): number => {
      return entry.history.findIndex((s) => s.id === snapshotId);
    },
    [entry.history]
  );

  // Meta entries
  const metaEntries = entry.meta ? Object.entries(entry.meta) : [];

  return (
    <div className="sdt-store-entry">
      {/* Header: expand/collapse -> name + id -> actions */}
      <div
        className={`sdt-store-header ${flash ? "flash" : ""}`}
        onClick={toggleExpand}
      >
        <button
          className="sdt-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand();
          }}
        >
          <IconChevron open={expanded} />
        </button>
        <div className="sdt-store-name">{entry.id}</div>
        <div className="sdt-store-actions">
          {/* Store actions will be added later */}
        </div>
      </div>

      {/* Details */}
      {expanded && (
        <div className="sdt-store-details">
          {/* State JSON */}
          <div className="sdt-section-title">State</div>
          <textarea
            className="sdt-state-json"
            value={JSON.stringify(entry.state, null, 2)}
            readOnly
            spellCheck={false}
          />

          {/* History - timestamp only */}
          {totalHistory > 0 && (
            <div className="sdt-history">
              <div className="sdt-section-title">History ({totalHistory})</div>
              {displayHistory.map((snapshot) => {
                const historyIndex = getSnapshotIndex(snapshot.id);
                const changedProps = getChangedProps(historyIndex);
                return (
                  <div key={snapshot.id} className="sdt-history-item">
                    <span className="sdt-history-index">[{historyIndex}]</span>
                    <span className="sdt-history-time">
                      {formatTime(snapshot.timestamp)}
                    </span>
                    <span className="sdt-history-props">
                      {changedProps.join(", ")}
                    </span>
                    <button
                      className="sdt-history-revert"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevert(snapshot.id);
                      }}
                    >
                      Revert
                    </button>
                  </div>
                );
              })}

              {/* Expand button for more history */}
              {hasMoreHistory && !historyExpanded && (
                <div className="sdt-history-expand">
                  <button
                    className="sdt-history-expand-btn"
                    onClick={() => setHistoryExpanded(true)}
                  >
                    Show{" "}
                    {Math.min(totalHistory, MAX_HISTORY_COUNT) -
                      DEFAULT_HISTORY_COUNT}{" "}
                    more
                  </button>
                </div>
              )}
              {historyExpanded && totalHistory > DEFAULT_HISTORY_COUNT && (
                <div className="sdt-history-expand">
                  <button
                    className="sdt-history-expand-btn"
                    onClick={() => setHistoryExpanded(false)}
                  >
                    Show less
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Metadata Section */}
          <div className="sdt-metadata">
            <div className="sdt-section-title">Metadata</div>
            <div className="sdt-metadata-row">
              <span className="sdt-metadata-label">Created:</span>
              <span className="sdt-metadata-value">
                {formatDateTime(entry.createdAt)}
              </span>
            </div>
            {entry.codeLocation && (
              <div className="sdt-metadata-row">
                <span className="sdt-metadata-label">Location:</span>
                <span className="sdt-metadata-value code-location">
                  {entry.codeLocation}
                </span>
              </div>
            )}
            {metaEntries.length > 0 && (
              <>
                <div
                  className="sdt-section-title"
                  style={{ marginTop: 8, marginBottom: 4 }}
                >
                  spec.meta
                </div>
                {metaEntries.map(([key, value]) => {
                  const formatted = formatValue(value);
                  return (
                    <div key={key} className="sdt-metadata-row">
                      <span className="sdt-metadata-label">{key}:</span>
                      <span
                        className={`sdt-metadata-value sdt-state-value ${formatted.type}`}
                      >
                        {formatted.text}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Event Entry Component
// ============================================================================

const EVENT_TYPE_LABELS: Record<
  DevtoolsEventType,
  { label: string; color: string }
> = {
  change: { label: "CHG", color: "#60a5fa" }, // blue
  create: { label: "NEW", color: "#4ade80" }, // green
  dispose: { label: "DEL", color: "#f87171" }, // red
  dispatch: { label: "ACT", color: "#a78bfa" }, // purple
  error: { label: "ERR", color: "#f87171" }, // red
};

const ALL_EVENT_TYPES: DevtoolsEventType[] = [
  "change",
  "create",
  "dispose",
  "dispatch",
  "error",
];

interface EventEntryProps {
  event: DevtoolsEvent;
  onTargetClick?: (storeId: string) => void;
}

const EventEntry = memo(function EventEntry({
  event,
  onTargetClick,
}: EventEntryProps) {
  const typeInfo = EVENT_TYPE_LABELS[event.type];
  const isStoreTarget = event.target !== "window";

  const handleCopy = useCallback(() => {
    const copyData = {
      type: event.type,
      target: event.target,
      timestamp: new Date(event.timestamp).toISOString(),
      extra: event.extra,
      data: event.data,
    };
    navigator.clipboard.writeText(JSON.stringify(copyData, null, 2));
  }, [event]);

  const handleTargetClick = useCallback(() => {
    if (isStoreTarget && onTargetClick) {
      onTargetClick(event.target);
    }
  }, [event.target, isStoreTarget, onTargetClick]);

  return (
    <div className="sdt-event-entry">
      <span className="sdt-event-time">{formatTime(event.timestamp)}</span>
      <span
        className="sdt-event-type"
        style={{
          backgroundColor: typeInfo.color + "20",
          color: typeInfo.color,
        }}
      >
        {typeInfo.label}
      </span>
      <span
        className={`sdt-event-target ${isStoreTarget ? "clickable" : ""}`}
        onClick={handleTargetClick}
        title={isStoreTarget ? "Click to view store" : undefined}
      >
        {event.target}
      </span>
      {event.extra && (
        <span className="sdt-event-extra" title={event.extra}>
          {event.extra}
        </span>
      )}
      <button
        className="sdt-event-copy"
        onClick={handleCopy}
        title="Copy event data"
      >
        <IconCopy />
      </button>
    </div>
  );
});

// ============================================================================
// Event Filter Bar Component
// ============================================================================

interface EventFilterBarProps {
  /** null means "All" is selected (no filtering) */
  activeFilters: Set<DevtoolsEventType> | null;
  onFilterChange: (filters: Set<DevtoolsEventType> | null) => void;
  onClear: () => void;
}

function EventFilterBar({
  activeFilters,
  onFilterChange,
  onClear,
}: EventFilterBarProps) {
  const isAllSelected = activeFilters === null;

  const handleAllClick = useCallback(() => {
    onFilterChange(null);
  }, [onFilterChange]);

  const handleTypeClick = useCallback(
    (type: DevtoolsEventType) => {
      if (isAllSelected) {
        // Switching from "All" to a specific filter
        onFilterChange(new Set([type]));
      } else {
        const next = new Set(activeFilters);
        if (next.has(type)) {
          next.delete(type);
          // If no filters left, switch back to "All"
          if (next.size === 0) {
            onFilterChange(null);
          } else {
            onFilterChange(next);
          }
        } else {
          next.add(type);
          onFilterChange(next);
        }
      }
    },
    [activeFilters, isAllSelected, onFilterChange]
  );

  return (
    <div className="sdt-event-filters">
      <div className="sdt-event-filter-chips">
        <button
          className={`sdt-event-filter-chip ${isAllSelected ? "active" : ""}`}
          onClick={handleAllClick}
          style={{
            borderColor: isAllSelected ? "#a1a1aa" : undefined,
            backgroundColor: isAllSelected ? "#a1a1aa20" : undefined,
          }}
        >
          All
        </button>
        {ALL_EVENT_TYPES.map((type) => {
          const info = EVENT_TYPE_LABELS[type];
          const isActive = !isAllSelected && activeFilters.has(type);
          return (
            <button
              key={type}
              className={`sdt-event-filter-chip ${isActive ? "active" : ""}`}
              onClick={() => handleTypeClick(type)}
              style={{
                borderColor: isActive ? info.color : undefined,
                backgroundColor: isActive ? info.color + "20" : undefined,
              }}
            >
              {info.label}
            </button>
          );
        })}
      </div>
      <button
        className="sdt-event-clear-btn"
        onClick={onClear}
        title="Clear all events"
      >
        <IconClear />
      </button>
    </div>
  );
}

// ============================================================================
// Resize Handle Component
// ============================================================================

interface ResizeHandleProps {
  position: PanelPosition; // "left" or "bottom"
  onResize: (delta: number) => void;
}

function ResizeHandle({ position, onResize }: ResizeHandleProps) {
  const [active, setActive] = useState(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setActive(true);
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      // Disable text selection during drag for smooth resizing
      document.body.style.userSelect = "none";
      document.body.style.cursor =
        position === "bottom" ? "ns-resize" : "ew-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const lastPos = lastPosRef.current;

        if (position === "bottom") {
          // Panel at bottom: drag up = bigger, drag down = smaller
          const delta = lastPos.y - moveEvent.clientY;
          onResize(delta);
        } else if (position === "left") {
          // Panel on left: drag right = bigger, drag left = smaller
          const delta = moveEvent.clientX - lastPos.x;
          onResize(delta);
        }

        lastPosRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        setActive(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [position, onResize]
  );

  // Position the handle on the correct edge:
  // - Panel on left: handle on RIGHT edge
  // - Panel on bottom: handle on TOP edge
  const isVertical = position === "bottom";
  const handleClass = isVertical ? "vertical top" : "horizontal right";

  return (
    <div
      className={`sdt-resize-handle ${handleClass} ${active ? "active" : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export type PanelPosition = "left" | "bottom";

export interface DevtoolsPanelProps {
  controller: DevtoolsController;
  position?: PanelPosition;
  onPositionChange?: (position: PanelPosition) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onResize?: (size: number) => void;
  initialSize?: number;
  initialCollapsed?: boolean;
}

export function DevtoolsPanel({
  controller,
  position: initialPosition = "left",
  onPositionChange,
  onCollapsedChange,
  onResize,
  initialSize = 360,
  initialCollapsed = false,
}: DevtoolsPanelProps) {
  // Transforms for Set<->Array conversion
  const eventFiltersTransform = useMemo(
    () => ({
      toStorage: (
        value: Set<DevtoolsEventType> | null
      ): DevtoolsEventType[] | null => (value ? Array.from(value) : null),
      fromStorage: (stored: unknown): Set<DevtoolsEventType> | null =>
        Array.isArray(stored) ? new Set(stored as DevtoolsEventType[]) : null,
    }),
    []
  );

  // UI state (persisted)
  const [activeTab, setActiveTab] = usePersistentState<TabId>(
    "activeTab",
    "stores"
  );
  const [collapsed, setCollapsed] = usePersistentState(
    "collapsed",
    initialCollapsed
  );
  const [size, setSize] = usePersistentState("size", initialSize);
  const [position, setPosition] = usePersistentState<PanelPosition>(
    "position",
    initialPosition
  );

  // Stores state
  const [stores, setStores] = useState<DevtoolsStoreEntry[]>([]);
  const [storeSearchQuery, setStoreSearchQuery] = usePersistentState(
    "storeSearchQuery",
    ""
  );
  const [sortByActivity, setSortByActivity] = usePersistentState(
    "sortByActivity",
    true
  ); // Default: sort by recent activity
  // Track store versions for flash detection (storeId -> history length) - use ref to avoid closure issues
  const storeVersionsRef = useRef<Map<string, number>>(new Map());
  // Store IDs that should flash
  const [flashingStores, setFlashingStores] = useState<Set<string>>(new Set());
  // Force expand/collapse all stores (null = use individual state)
  const [forceExpanded, setForceExpanded] = useState<boolean | null>(null);

  // Reset forceExpanded after it's applied to allow individual toggling
  useEffect(() => {
    if (forceExpanded !== null) {
      const timer = setTimeout(() => setForceExpanded(null), 50);
      return () => clearTimeout(timer);
    }
  }, [forceExpanded]);

  // Events state
  const [events, setEvents] = useState<DevtoolsEvent[]>([]);
  const [eventSearchQuery, setEventSearchQuery] = usePersistentState(
    "eventSearchQuery",
    ""
  );
  // null means "All" is selected (no filtering) (persisted)
  const [eventFilters, setEventFilters] =
    usePersistentState<Set<DevtoolsEventType> | null>(
      "eventFilters",
      null,
      eventFiltersTransform
    );

  // Track counts for tab flash
  const prevStoresVersion = useRef<number>(0);
  const prevEventsCount = useRef<number>(0);
  const [storesTabFlash, setStoresTabFlash] = useState(false);
  const [eventsTabFlash, setEventsTabFlash] = useState(false);

  // Subscribe to controller updates
  useEffect(() => {
    const update = () => {
      const newStores = controller.getStores();
      const newEvents = controller.getEvents();

      // Calculate total version from all store histories
      const newStoresVersion = newStores.reduce(
        (sum, s) => sum + s.history.length,
        0
      );

      // Flash stores tab if any store state changed (not on first load)
      if (
        prevStoresVersion.current > 0 &&
        newStoresVersion > prevStoresVersion.current
      ) {
        setStoresTabFlash(true);
        setTimeout(() => setStoresTabFlash(false), 600);
      }
      prevStoresVersion.current = newStoresVersion;

      // Flash events tab if new events (not on first load)
      if (
        prevEventsCount.current > 0 &&
        newEvents.length > prevEventsCount.current
      ) {
        setEventsTabFlash(true);
        setTimeout(() => setEventsTabFlash(false), 600);
      }
      prevEventsCount.current = newEvents.length;

      // Track which stores changed for individual flash
      const newFlashing = new Set<string>();

      for (const store of newStores) {
        const prevVersion = storeVersionsRef.current.get(store.id) ?? 0;
        const newVersion = store.history.length;

        // Flash if version increased (not on first appearance)
        if (prevVersion > 0 && newVersion > prevVersion) {
          newFlashing.add(store.id);
        }

        // Update ref
        storeVersionsRef.current.set(store.id, newVersion);
      }

      if (newFlashing.size > 0) {
        setFlashingStores(newFlashing);
        setTimeout(() => setFlashingStores(new Set()), 500);
      }

      setStores(newStores);
      setEvents(newEvents);
    };
    update();
    return controller.subscribe(update);
  }, [controller]);

  // Filter and sort stores
  const filteredStores = useMemo(() => {
    let result = stores;

    // Filter by search query
    if (storeSearchQuery) {
      const query = storeSearchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query)
      );
    }

    // Sort by recent activity (last snapshot timestamp, or createdAt)
    if (sortByActivity) {
      result = [...result].sort((a, b) => {
        const aLastActivity =
          a.history.length > 0
            ? a.history[a.history.length - 1].timestamp
            : a.createdAt;
        const bLastActivity =
          b.history.length > 0
            ? b.history[b.history.length - 1].timestamp
            : b.createdAt;
        return bLastActivity - aLastActivity; // Descending (most recent first)
      });
    }

    return result;
  }, [stores, storeSearchQuery, sortByActivity]);

  // Filter events by search and type
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by type (null means "All" - no filtering)
    if (eventFilters !== null) {
      filtered = filtered.filter((e) => eventFilters.has(e.type));
    }

    // Filter by search
    if (eventSearchQuery) {
      const query = eventSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.target.toLowerCase().includes(query) ||
          e.type.toLowerCase().includes(query) ||
          e.extra?.toLowerCase().includes(query)
      );
    }

    // Show most recent first
    return [...filtered].reverse();
  }, [events, eventSearchQuery, eventFilters]);

  const handleRevert = useCallback(
    (storeId: string, snapshotId: number) => {
      controller.revertToSnapshot(storeId, snapshotId);
    },
    [controller]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  }, [onCollapsedChange]);

  const togglePosition = useCallback(() => {
    const newPosition: PanelPosition = position === "left" ? "bottom" : "left";
    setPosition(newPosition);
    onPositionChange?.(newPosition);
  }, [position, onPositionChange]);

  const handleResize = useCallback(
    (delta: number) => {
      setSize((prev) => {
        const minSize = 200;
        const maxSize = position === "bottom" ? 600 : 800;
        const newSize = Math.min(maxSize, Math.max(minSize, prev + delta));
        onResize?.(newSize);
        return newSize;
      });
    },
    [position, onResize]
  );

  const handleFilterChange = useCallback(
    (filters: Set<DevtoolsEventType> | null) => {
      setEventFilters(filters);
    },
    []
  );

  const handleClearEvents = useCallback(() => {
    controller.clearEvents();
  }, [controller]);

  // Toggle sort by activity for stores
  const toggleSortByActivity = useCallback(() => {
    setSortByActivity((prev) => !prev);
  }, []);

  // Navigate to store from event target click
  const handleEventTargetClick = useCallback((storeId: string) => {
    setActiveTab("stores");
    setStoreSearchQuery(storeId);
  }, []);

  // Report initial size
  useEffect(() => {
    onResize?.(size);
  }, []);

  const positionClass = `position-${position}`;

  // Calculate off-screen position when collapsed
  const expandedStyle: React.CSSProperties = collapsed
    ? position === "left"
      ? { left: "-9999px" }
      : { bottom: "-9999px" }
    : {};

  return (
    <>
      <style>{panelStyles}</style>

      {/* Expanded Panel - always mounted, moved off-screen when collapsed */}
      <div
        className={`storion-devtools ${positionClass}`}
        style={expandedStyle}
      >
        {/* Resize Handle */}
        <ResizeHandle position={position} onResize={handleResize} />

        {/* Header */}
        <div className="sdt-header">
          <div className="sdt-logo">
            <div className="sdt-logo-icon">⚡</div>
            <span className="sdt-title">Storion</span>
          </div>
          <div className="sdt-header-actions">
            <button
              className="sdt-btn"
              onClick={togglePosition}
              title={position === "left" ? "Dock to bottom" : "Dock to left"}
            >
              {position === "left" ? <IconDockBottom /> : <IconDockLeft />}
            </button>
            <button
              className="sdt-btn"
              onClick={toggleCollapsed}
              title="Minimize"
            >
              <IconMinimize />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="sdt-tabs">
          <button
            className={`sdt-tab ${activeTab === "stores" ? "active" : ""} ${
              storesTabFlash ? "flash" : ""
            }`}
            onClick={() => setActiveTab("stores")}
          >
            Stores
            <span className="sdt-tab-count">{stores.length}</span>
          </button>
          <button
            className={`sdt-tab ${activeTab === "events" ? "active" : ""} ${
              eventsTabFlash ? "flash" : ""
            }`}
            onClick={() => setActiveTab("events")}
          >
            Events
            <span className="sdt-tab-count">{events.length}</span>
          </button>
        </div>

        {/* Content */}
        {activeTab === "stores" && (
          <TabContent
            searchBar={
              <SearchBar
                value={storeSearchQuery}
                onChange={setStoreSearchQuery}
                placeholder="Search stores..."
              />
            }
            actionBar={
              <div className="sdt-stores-actions">
                <button
                  className={`sdt-btn sdt-btn-toggle ${
                    sortByActivity ? "active" : ""
                  }`}
                  onClick={toggleSortByActivity}
                  title={
                    sortByActivity
                      ? "Showing recent activity first"
                      : "Show recent activity first"
                  }
                >
                  <IconActivity />
                  <span>Recent</span>
                </button>
                <button
                  className="sdt-btn sdt-btn-ghost"
                  onClick={() => setForceExpanded(true)}
                  title="Expand all stores"
                >
                  <IconExpandAll />
                </button>
                <button
                  className="sdt-btn sdt-btn-ghost"
                  onClick={() => setForceExpanded(false)}
                  title="Collapse all stores"
                >
                  <IconCollapseAll />
                </button>
              </div>
            }
          >
            <MainContent
              isEmpty={filteredStores.length === 0}
              emptyIcon="📦"
              emptyMessage="No stores found"
              emptyHint="Add devtoolsMiddleware to your container"
            >
              {filteredStores.map((entry) => (
                <StoreEntry
                  key={entry.id}
                  entry={entry}
                  onRevert={(snapshotId) => handleRevert(entry.id, snapshotId)}
                  flash={flashingStores.has(entry.id)}
                  forceExpanded={forceExpanded}
                />
              ))}
            </MainContent>
          </TabContent>
        )}

        {activeTab === "events" && (
          <TabContent
            searchBar={
              <SearchBar
                value={eventSearchQuery}
                onChange={setEventSearchQuery}
                placeholder="Search events..."
              />
            }
            filterBar={
              <EventFilterBar
                activeFilters={eventFilters}
                onFilterChange={handleFilterChange}
                onClear={handleClearEvents}
              />
            }
          >
            <MainContent
              isEmpty={filteredEvents.length === 0}
              emptyIcon="📋"
              emptyMessage="No events yet"
              emptyHint="Events will appear as stores change"
            >
              {filteredEvents.map((event) => (
                <EventEntry
                  key={event.id}
                  event={event}
                  onTargetClick={handleEventTargetClick}
                />
              ))}
            </MainContent>
          </TabContent>
        )}
      </div>

      {/* Collapsed Floating Button */}
      {collapsed && (
        <button
          className="sdt-floating-btn"
          onClick={toggleCollapsed}
          title="Open Storion DevTools"
        >
          ⚡
        </button>
      )}
    </>
  );
}
