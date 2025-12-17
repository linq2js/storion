/**
 * Compare Modal Component
 *
 * Modal for comparing a history snapshot with the current state.
 */

import { useMemo } from "react";
import type { StateSnapshot } from "../../devtools/types";
import { formatTime } from "../utils";
import { IconCancel } from "./icons";

export interface CompareModalProps {
  storeId: string;
  snapshot: StateSnapshot;
  currentState: Record<string, unknown>;
  onClose: () => void;
}

export function CompareModal({
  storeId,
  snapshot,
  currentState,
  onClose,
}: CompareModalProps) {
  // Generate diff between snapshot and current state
  const diff = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(snapshot.state),
      ...Object.keys(currentState),
    ]);

    const changes: Array<{
      key: string;
      type: "added" | "removed" | "changed" | "unchanged";
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    for (const key of allKeys) {
      const oldValue = snapshot.state[key];
      const newValue = currentState[key];
      const oldExists = key in snapshot.state;
      const newExists = key in currentState;

      if (!oldExists && newExists) {
        changes.push({ key, type: "added", oldValue: undefined, newValue });
      } else if (oldExists && !newExists) {
        changes.push({ key, type: "removed", oldValue, newValue: undefined });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ key, type: "changed", oldValue, newValue });
      } else {
        changes.push({ key, type: "unchanged", oldValue, newValue });
      }
    }

    return changes.sort((a, b) => {
      // Sort: changed first, then added, then removed, then unchanged
      const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
      return order[a.type] - order[b.type];
    });
  }, [snapshot.state, currentState]);

  const formatJsonValue = (value: unknown): string => {
    if (value === undefined) return "undefined";
    return JSON.stringify(value, null, 2);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOverlayTouchEnd = (e: React.TouchEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="sdt-modal-overlay"
      onClick={handleOverlayClick}
      onTouchEnd={handleOverlayTouchEnd}
    >
      <div className="sdt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sdt-modal-header">
          <span className="sdt-modal-title">
            Compare: {storeId} @ {formatTime(snapshot.timestamp)} vs Current
          </span>
          <button className="sdt-modal-close" onClick={onClose}>
            <IconCancel />
          </button>
        </div>
        <div className="sdt-modal-body">
          <div className="sdt-compare-legend">
            <span className="sdt-legend-item changed">● Changed</span>
            <span className="sdt-legend-item added">● Added</span>
            <span className="sdt-legend-item removed">● Removed</span>
            <span className="sdt-legend-item unchanged">● Unchanged</span>
          </div>
          <div className="sdt-compare-content">
            {diff.map(({ key, type, oldValue, newValue }) => (
              <div key={key} className={`sdt-compare-row ${type}`}>
                <div className="sdt-compare-key">{key}</div>
                <div className="sdt-compare-values">
                  <div className="sdt-compare-old">
                    <span className="sdt-compare-label">Snapshot:</span>
                    <pre>{formatJsonValue(oldValue)}</pre>
                  </div>
                  <div className="sdt-compare-new">
                    <span className="sdt-compare-label">Current:</span>
                    <pre>{formatJsonValue(newValue)}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

