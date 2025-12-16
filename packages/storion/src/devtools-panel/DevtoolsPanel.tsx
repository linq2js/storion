/**
 * Devtools Panel Component
 *
 * Renders in its own React root, separate from the main app.
 */

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
} from "../devtools/types";
import { panelStyles, colors } from "./styles";
import { SearchBar, TabContent, MainContent } from "./components/TabLayout";

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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Position icons
const IconDockLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const IconDockBottom = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="15" x2="21" y2="15" />
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
}

const StoreEntry = memo(function StoreEntry({
  entry,
  onRevert,
}: StoreEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const stateEntries = useMemo(
    () => Object.entries(entry.state),
    [entry.state]
  );

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
      <div className="sdt-store-header" onClick={toggleExpand}>
        <button
          className="sdt-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand();
          }}
        >
          <IconChevron open={expanded} />
        </button>
        <div className="sdt-store-name">
          {entry.name}
          <span className="sdt-store-id">{entry.id}</span>
        </div>
        <div className="sdt-store-actions">
          {/* Store actions will be added later */}
        </div>
      </div>

      {/* Details */}
      {expanded && (
        <div className="sdt-store-details">
          {/* State Tree */}
          <div className="sdt-section-title">State</div>
          <div className="sdt-state-tree">
            {stateEntries.map(([key, value]) => {
              const formatted = formatValue(value);
              return (
                <div key={key} style={{ marginBottom: 4 }}>
                  <span className="sdt-state-key">{key}</span>
                  <span style={{ color: colors.text.muted }}>: </span>
                  <span className={`sdt-state-value ${formatted.type}`}>
                    {formatted.text}
                  </span>
                </div>
              );
            })}
          </div>

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
// Resize Handle Component
// ============================================================================

interface ResizeHandleProps {
  position: "left" | "right" | "bottom";
  onResize: (delta: number) => void;
}

function ResizeHandle({ position, onResize }: ResizeHandleProps) {
  const [active, setActive] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setActive(true);

      const startX = e.clientX;
      const startY = e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (position === "bottom") {
          const delta = startY - moveEvent.clientY;
          onResize(delta);
        } else if (position === "left") {
          const delta = startX - moveEvent.clientX;
          onResize(delta);
        } else {
          const delta = moveEvent.clientX - startX;
          onResize(-delta);
        }
      };

      const handleMouseUp = () => {
        setActive(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [position, onResize]
  );

  const isVertical = position === "bottom";
  const handleClass = isVertical ? "vertical top" : `horizontal ${position}`;

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
  const [stores, setStores] = useState<DevtoolsStoreEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [size, setSize] = useState(initialSize);
  const [position, setPosition] = useState<PanelPosition>(initialPosition);

  // Subscribe to controller updates
  useEffect(() => {
    const update = () => {
      setStores(controller.getStores());
    };
    update();
    return controller.subscribe(update);
  }, [controller]);

  // Filter stores by search
  const filteredStores = useMemo(() => {
    if (!searchQuery) return stores;
    const query = searchQuery.toLowerCase();
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query)
    );
  }, [stores, searchQuery]);

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
    setPosition((prev) => {
      const next: PanelPosition = prev === "left" ? "bottom" : "left";
      onPositionChange?.(next);
      return next;
    });
  }, [onPositionChange]);

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

  // Report initial size
  useEffect(() => {
    onResize?.(size);
  }, []);

  const positionClass = `position-${position}`;
  const collapsedClass = collapsed ? "collapsed" : "";

  return (
    <>
      <style>{panelStyles}</style>
      <div className={`storion-devtools ${positionClass} ${collapsedClass}`}>
        {/* Resize Handle */}
        {!collapsed && <ResizeHandle position={position} onResize={handleResize} />}

        {/* Header */}
        <div className="sdt-header">
          <div className="sdt-logo">
            <div className="sdt-logo-icon">⚡</div>
            {!collapsed && <span className="sdt-title">Storion</span>}
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

        {/* Content (hidden when collapsed) */}
        {!collapsed && (
          <TabContent
            searchBar={
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search stores..."
              />
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
                />
              ))}
            </MainContent>
          </TabContent>
        )}
      </div>
    </>
  );
}
