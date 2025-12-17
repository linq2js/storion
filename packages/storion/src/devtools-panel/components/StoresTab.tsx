/**
 * Stores Tab Component
 *
 * Displays and manages the list of stores in the devtools panel.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  DevtoolsController,
  DevtoolsStoreEntry,
  StateSnapshot,
} from "../../devtools/types";
import { usePersistentState } from "../hooks";
import { SearchBar, TabContent, MainContent } from "./TabLayout";
import { IconActivity, IconExpandAll, IconCollapseAll } from "./icons";
import { StoreEntry } from "./StoreEntry";
import { CompareModal } from "./CompareModal";

export interface StoresTabProps {
  controller: DevtoolsController;
  stores: DevtoolsStoreEntry[];
  /** Controlled search query from parent */
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNavigateToEvents: (storeId: string) => void;
}

export function StoresTab({
  controller,
  stores,
  searchQuery,
  onSearchQueryChange,
  onNavigateToEvents,
}: StoresTabProps) {
  // Sort state (persisted)
  const [sortByActivity, setSortByActivity] = usePersistentState(
    "sortByActivity",
    true
  );

  // Track store versions for flash detection (storeId -> history length)
  const storeVersionsRef = useRef<Map<string, number>>(new Map());
  // Store IDs that should flash
  const [flashingStores, setFlashingStores] = useState<Set<string>>(new Set());
  // Force expand/collapse all stores (null = use individual state)
  const [forceExpanded, setForceExpanded] = useState<boolean | null>(null);

  // Compare modal state
  const [compareData, setCompareData] = useState<{
    storeId: string;
    snapshot: StateSnapshot;
  } | null>(null);

  // Track which stores changed for individual flash
  useEffect(() => {
    const newFlashing = new Set<string>();

    for (const store of stores) {
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
      const timer = setTimeout(() => setFlashingStores(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [stores]);

  // Reset forceExpanded after it's applied to allow individual toggling
  useEffect(() => {
    if (forceExpanded !== null) {
      const timer = setTimeout(() => setForceExpanded(null), 50);
      return () => clearTimeout(timer);
    }
  }, [forceExpanded]);

  // Filter and sort stores
  const filteredStores = useMemo(() => {
    let result = stores;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
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
  }, [stores, searchQuery, sortByActivity]);

  // Handlers
  const handleRevert = useCallback(
    (storeId: string, snapshotId: number) => {
      controller.revertToSnapshot(storeId, snapshotId);
    },
    [controller]
  );

  const toggleSortByActivity = useCallback(() => {
    setSortByActivity((prev) => !prev);
  }, []);

  const handleShowEvents = useCallback(
    (storeId: string) => {
      onNavigateToEvents(storeId);
    },
    [onNavigateToEvents]
  );

  const handleCompare = useCallback(
    (storeId: string, snapshot: StateSnapshot) => {
      setCompareData({ storeId, snapshot });
    },
    []
  );

  const handleCloseCompare = useCallback(() => {
    setCompareData(null);
  }, []);

  const handleStateEdit = useCallback(
    (storeId: string, newState: Record<string, unknown>) => {
      const store = controller.getStore(storeId);
      if (store && store.instance) {
        const actions = store.instance.actions as Record<string, unknown>;
        if (typeof actions.__revertState === "function") {
          actions.__revertState(newState);
        }
      }
    },
    [controller]
  );

  return (
    <>
      <TabContent
        searchBar={
          <SearchBar
            value={searchQuery}
            onChange={onSearchQueryChange}
            placeholder="Search stores..."
          />
        }
        actionBar={
          <div className="sdt-stores-actions">
            <button
              className={`sdt-btn sdt-btn-toggle ${sortByActivity ? "active" : ""}`}
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
              onShowEvents={handleShowEvents}
              onCompare={handleCompare}
              onStateEdit={handleStateEdit}
              flash={flashingStores.has(entry.id)}
              forceExpanded={forceExpanded}
            />
          ))}
        </MainContent>
      </TabContent>

      {/* Compare Modal */}
      {compareData && (
        <CompareModal
          storeId={compareData.storeId}
          snapshot={compareData.snapshot}
          currentState={
            stores.find((s) => s.id === compareData.storeId)?.state ?? {}
          }
          onClose={handleCloseCompare}
        />
      )}
    </>
  );
}

