/**
 * Store Entry Component
 *
 * Displays a single store with its state, history, and metadata.
 */

import { useState, useEffect, useCallback, memo } from "react";
import type { DevtoolsStoreEntry, StateSnapshot } from "../../devtools/types";
import { formatTime, formatDateTime, formatValue } from "../utils";
import {
  IconChevron,
  IconEdit,
  IconSave,
  IconCancel,
  IconEvents,
} from "./icons";

const DEFAULT_HISTORY_COUNT = 5;
const MAX_HISTORY_COUNT = 50;

export interface StoreEntryProps {
  entry: DevtoolsStoreEntry;
  onRevert: (snapshotId: number) => void;
  onShowEvents?: (storeId: string) => void;
  onCompare?: (storeId: string, snapshot: StateSnapshot) => void;
  onStateEdit?: (storeId: string, newState: Record<string, unknown>) => void;
  flash?: boolean;
  forceExpanded?: boolean | null; // null = use local state, true/false = force
}

export const StoreEntry = memo(function StoreEntry({
  entry,
  onRevert,
  onShowEvents,
  onCompare,
  onStateEdit,
  flash = false,
  forceExpanded = null,
}: StoreEntryProps) {
  const [expanded, setExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

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

  // Extract file path from code location (remove line:column numbers)
  const getFileUrl = (location: string): string => {
    // Remove line:column suffix (e.g., "/path/file.ts:10:5" -> "/path/file.ts")
    return location.replace(/:\d+:\d+$/, "").replace(/:\d+$/, "");
  };

  // State editing handlers
  const handleStartEdit = useCallback(() => {
    setEditValue(JSON.stringify(entry.state, null, 2));
    setIsEditing(true);
  }, [entry.state]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue("");
  }, []);

  const handleSaveEdit = useCallback(() => {
    try {
      const newState = JSON.parse(editValue);
      onStateEdit?.(entry.id, newState);
      setIsEditing(false);
      setEditValue("");
    } catch {
      // Invalid JSON - don't save
      alert("Invalid JSON. Please fix the syntax and try again.");
    }
  }, [editValue, entry.id, onStateEdit]);

  const handleShowEvents = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShowEvents?.(entry.id);
    },
    [entry.id, onShowEvents]
  );

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
          <button
            className="sdt-store-action-btn"
            onClick={handleShowEvents}
            title="Show events for this store"
          >
            <IconEvents />
          </button>
        </div>
      </div>

      {/* Details */}
      {expanded && (
        <div className="sdt-store-details">
          {/* State JSON */}
          <div className="sdt-section-header">
            <div className="sdt-section-title">State</div>
            <div className="sdt-section-actions">
              {!isEditing ? (
                <button
                  className="sdt-edit-btn"
                  onClick={handleStartEdit}
                  title="Edit state"
                >
                  <IconEdit />
                </button>
              ) : (
                <>
                  <button
                    className="sdt-save-btn"
                    onClick={handleSaveEdit}
                    title="Save changes"
                  >
                    <IconSave />
                  </button>
                  <button
                    className="sdt-cancel-btn"
                    onClick={handleCancelEdit}
                    title="Cancel editing"
                  >
                    <IconCancel />
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            className={`sdt-state-json ${isEditing ? "editing" : ""}`}
            value={isEditing ? editValue : JSON.stringify(entry.state, null, 2)}
            onChange={(e) => setEditValue(e.target.value)}
            readOnly={!isEditing}
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
                      className="sdt-history-compare"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompare?.(entry.id, snapshot);
                      }}
                      title="Compare with current state"
                    >
                      Compare
                    </button>
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
                <a
                  className="sdt-metadata-value code-location"
                  href={getFileUrl(entry.codeLocation)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {entry.codeLocation}
                </a>
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

