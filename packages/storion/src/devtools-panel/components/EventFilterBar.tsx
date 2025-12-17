/**
 * Event Filter Bar Component
 *
 * Filter bar for event types in the Events tab.
 */

import { useCallback } from "react";
import type { DevtoolsEventType } from "../../devtools/types";
import { EVENT_TYPE_LABELS, ALL_EVENT_TYPES } from "./EventEntry";
import { IconClear } from "./icons";

export interface EventFilterBarProps {
  /** null means "All" is selected (no filtering) */
  activeFilters: Set<DevtoolsEventType> | null;
  onFilterChange: (filters: Set<DevtoolsEventType> | null) => void;
  onClear: () => void;
}

export function EventFilterBar({
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

