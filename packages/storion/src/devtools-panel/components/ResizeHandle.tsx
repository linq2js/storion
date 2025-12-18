/**
 * Resize Handle Component
 *
 * Draggable handle for resizing the devtools panel.
 */

import { useState, useRef, useCallback } from "react";
import type { PanelPosition } from "../DevtoolsPanel";

export interface ResizeHandleProps {
  position: PanelPosition; // "left", "bottom", or "right"
  onResize: (delta: number) => void;
}

export function ResizeHandle({ position, onResize }: ResizeHandleProps) {
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
        } else {
          // Panel on left or right: horizontal resize
          // Note: delta inversion for right position is handled in DevtoolsPanel
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

  // Touch support for mobile devices
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      setActive(true);
      const touch = e.touches[0];
      lastPosRef.current = { x: touch.clientX, y: touch.clientY };

      // Disable text selection during drag for smooth resizing
      document.body.style.userSelect = "none";

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const touch = moveEvent.touches[0];
        const lastPos = lastPosRef.current;

        if (position === "bottom") {
          const delta = lastPos.y - touch.clientY;
          onResize(delta);
        } else {
          // Panel on left or right: horizontal resize
          // Note: delta inversion for right position is handled in DevtoolsPanel
          const delta = touch.clientX - lastPos.x;
          onResize(delta);
        }

        lastPosRef.current = { x: touch.clientX, y: touch.clientY };
      };

      const handleTouchEnd = () => {
        setActive(false);
        document.body.style.userSelect = "";
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };

      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    },
    [position, onResize]
  );

  // Position the handle on the correct edge:
  // - Panel on left: handle on RIGHT edge
  // - Panel on right: handle on LEFT edge
  // - Panel on bottom: handle on TOP edge
  const isVertical = position === "bottom";
  const handleClass = isVertical
    ? "vertical top"
    : position === "right"
    ? "horizontal left"
    : "horizontal right";

  return (
    <div
      className={`sdt-resize-handle ${handleClass} ${active ? "active" : ""}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  );
}

