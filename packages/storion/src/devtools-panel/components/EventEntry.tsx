/**
 * Event Entry Component
 *
 * Displays a single event in the events list.
 */

import { useCallback, memo } from "react";
import type { DevtoolsEvent, DevtoolsEventType } from "../../devtools/types";
import { formatTime } from "../utils";
import { IconCopy, IconReplay } from "./icons";

// Event type labels and colors
export const EVENT_TYPE_LABELS: Record<
  DevtoolsEventType,
  { label: string; color: string }
> = {
  change: { label: "CHG", color: "#60a5fa" }, // blue
  create: { label: "NEW", color: "#4ade80" }, // green
  dispose: { label: "DEL", color: "#f87171" }, // red
  dispatch: { label: "ACT", color: "#a78bfa" }, // purple
  error: { label: "ERR", color: "#f87171" }, // red
};

export const ALL_EVENT_TYPES: DevtoolsEventType[] = [
  "change",
  "create",
  "dispose",
  "dispatch",
  "error",
];

export interface EventEntryProps {
  event: DevtoolsEvent;
  onTargetClick?: (storeId: string) => void;
  onReplay?: (event: DevtoolsEvent) => void;
}

export const EventEntry = memo(function EventEntry({
  event,
  onTargetClick,
  onReplay,
}: EventEntryProps) {
  const typeInfo = EVENT_TYPE_LABELS[event.type];
  const isStoreTarget = event.target !== "window";
  const isDispatch = event.type === "dispatch";

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

  const handleReplay = useCallback(() => {
    onReplay?.(event);
  }, [event, onReplay]);

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
      <div className="sdt-event-actions">
        {isDispatch && (
          <button
            className="sdt-event-replay"
            onClick={handleReplay}
            title="Replay this action"
          >
            <IconReplay />
          </button>
        )}
        <button
          className="sdt-event-copy"
          onClick={handleCopy}
          title="Copy event data"
        >
          <IconCopy />
        </button>
      </div>
    </div>
  );
});

