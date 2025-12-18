/**
 * Devtools Panel Component
 *
 * Renders in its own React root, separate from the main app.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
  DevtoolsEvent,
  DevtoolsEventType,
} from "../devtools/types";
import { panelStyles } from "./styles";

// Components
import {
  IconMinimize,
  IconTransparency,
  IconDockLeft,
  IconDockBottom,
  IconDockRight,
} from "./components/icons";
import { ResizeHandle } from "./components/ResizeHandle";
import { StoresTab } from "./components/StoresTab";
import { EventsTab } from "./components/EventsTab";

// Hooks
import { usePersistentState, clearDevtoolsSettings, type TabId } from "./hooks";

export { clearDevtoolsSettings };

// ============================================================================
// Main Panel
// ============================================================================

export type PanelPosition = "left" | "bottom" | "right";

export interface DevtoolsPanelProps {
  controller: DevtoolsController;
  position?: PanelPosition;
  onPositionChange?: (position: PanelPosition) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onTransparencyChange?: (transparent: boolean) => void;
  onResize?: (size: number) => void;
  initialSize?: number;
  initialCollapsed?: boolean;
}

export function DevtoolsPanel({
  controller,
  position: initialPosition = "left",
  onPositionChange,
  onCollapsedChange,
  onTransparencyChange,
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

  // Panel UI state (persisted)
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

  // Data state
  const [stores, setStores] = useState<DevtoolsStoreEntry[]>([]);
  const [events, setEvents] = useState<DevtoolsEvent[]>([]);

  // Tab search queries (persisted, managed here for cross-tab navigation)
  const [storeSearchQuery, setStoreSearchQuery] = usePersistentState(
    "storeSearchQuery",
    ""
  );
  const [eventSearchQuery, setEventSearchQuery] = usePersistentState(
    "eventSearchQuery",
    ""
  );
  const [eventFilters, setEventFilters] =
    usePersistentState<Set<DevtoolsEventType> | null>(
      "eventFilters",
      null,
      eventFiltersTransform
    );

  // Transparency mode
  const [isTransparent, setIsTransparent] = useState(false);

  // Tab flash indicators
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

      setStores(newStores);
      setEvents(newEvents);
    };
    update();
    return controller.subscribe(update);
  }, [controller]);

  // Panel UI handlers
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  }, [onCollapsedChange]);

  const togglePosition = useCallback(() => {
    // Cycle: left → bottom → right → left
    const nextPosition: Record<PanelPosition, PanelPosition> = {
      left: "bottom",
      bottom: "right",
      right: "left",
    };
    const newPosition = nextPosition[position];
    setPosition(newPosition);
    onPositionChange?.(newPosition);
  }, [position, onPositionChange]);

  const toggleTransparency = useCallback(() => {
    setIsTransparent((prev) => {
      const next = !prev;
      onTransparencyChange?.(next);
      return next;
    });
  }, [onTransparencyChange]);

  const handleResize = useCallback(
    (delta: number) => {
      setSize((prev) => {
        const minSize = 200;
        const maxSize = position === "bottom" ? 600 : 800;
        // For right position, delta is inverted (drag left = bigger)
        const adjustedDelta = position === "right" ? -delta : delta;
        const newSize = Math.min(maxSize, Math.max(minSize, prev + adjustedDelta));
        onResize?.(newSize);
        return newSize;
      });
    },
    [position, onResize]
  );

  // Cross-tab navigation
  const handleNavigateToEvents = useCallback((storeId: string) => {
    setActiveTab("events");
    setEventSearchQuery(storeId);
  }, []);

  const handleNavigateToStore = useCallback((storeId: string) => {
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
      : position === "right"
      ? { right: "-9999px" }
      : { bottom: "-9999px" }
    : {};

  return (
    <>
      <style>{panelStyles}</style>

      {/* Expanded Panel - always mounted, moved off-screen when collapsed */}
      <div
        className={`storion-devtools ${positionClass} ${
          isTransparent ? "transparent" : ""
        }`}
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
              className={`sdt-btn ${isTransparent ? "active" : ""}`}
              onClick={toggleTransparency}
              title="Toggle transparency"
            >
              <IconTransparency />
            </button>
            <button
              className="sdt-btn"
              onClick={togglePosition}
              title={
                position === "left"
                  ? "Dock to bottom"
                  : position === "bottom"
                  ? "Dock to right"
                  : "Dock to left"
              }
            >
              {position === "left" ? (
                <IconDockBottom />
              ) : position === "bottom" ? (
                <IconDockRight />
              ) : (
                <IconDockLeft />
              )}
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

        {/* Tab Content */}
        {activeTab === "stores" && (
          <StoresTab
            controller={controller}
            stores={stores}
            searchQuery={storeSearchQuery}
            onSearchQueryChange={setStoreSearchQuery}
            onNavigateToEvents={handleNavigateToEvents}
          />
        )}

        {activeTab === "events" && (
          <EventsTab
            controller={controller}
            events={events}
            searchQuery={eventSearchQuery}
            onSearchQueryChange={setEventSearchQuery}
            filters={eventFilters}
            onFiltersChange={setEventFilters}
            onNavigateToStore={handleNavigateToStore}
          />
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
