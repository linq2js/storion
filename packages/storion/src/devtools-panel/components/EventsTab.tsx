/**
 * Events Tab Component
 *
 * Displays and manages the list of events in the devtools panel.
 */

import { useCallback, useMemo } from "react";
import type {
  DevtoolsController,
  DevtoolsEvent,
  DevtoolsEventType,
} from "../../devtools/types";
import { SearchBar, TabContent, MainContent } from "./TabLayout";
import { EventEntry } from "./EventEntry";
import { EventFilterBar } from "./EventFilterBar";

export interface EventsTabProps {
  controller: DevtoolsController;
  events: DevtoolsEvent[];
  /** Controlled search query from parent */
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  /** Controlled filters from parent */
  filters: Set<DevtoolsEventType> | null;
  onFiltersChange: (filters: Set<DevtoolsEventType> | null) => void;
  onNavigateToStore: (storeId: string) => void;
}

export function EventsTab({
  controller,
  events,
  searchQuery,
  onSearchQueryChange,
  filters,
  onFiltersChange,
  onNavigateToStore,
}: EventsTabProps) {

  // Filter events by search and type
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by type (null means "All" - no filtering)
    if (filters !== null) {
      filtered = filtered.filter((e) => filters.has(e.type));
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.target.toLowerCase().includes(query) ||
          e.type.toLowerCase().includes(query) ||
          e.extra?.toLowerCase().includes(query)
      );
    }

    // Show most recent first
    return [...filtered].reverse();
  }, [events, searchQuery, filters]);

  // Handlers
  const handleFilterChange = useCallback(
    (newFilters: Set<DevtoolsEventType> | null) => {
      onFiltersChange(newFilters);
    },
    [onFiltersChange]
  );

  const handleClearEvents = useCallback(() => {
    controller.clearEvents();
  }, [controller]);

  const handleTargetClick = useCallback(
    (storeId: string) => {
      onNavigateToStore(storeId);
    },
    [onNavigateToStore]
  );

  const handleReplay = useCallback(
    (event: DevtoolsEvent) => {
      if (event.type !== "dispatch") return;

      const store = controller.getStore(event.target);
      if (!store || !store.instance) return;

      // Parse action name and args from event
      const actionName = event.extra?.split("(")[0];
      if (!actionName) return;

      const actions = store.instance.actions as Record<string, Function>;
      const action = actions[actionName];
      if (typeof action !== "function") return;

      // Try to replay with stored args
      const args = event.data as unknown[] | undefined;
      if (args && Array.isArray(args)) {
        action(...args);
      } else {
        action();
      }
    },
    [controller]
  );

  return (
    <TabContent
      searchBar={
        <SearchBar
          value={searchQuery}
          onChange={onSearchQueryChange}
          placeholder="Search events..."
        />
      }
      filterBar={
        <EventFilterBar
          activeFilters={filters}
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
            onTargetClick={handleTargetClick}
            onReplay={handleReplay}
          />
        ))}
      </MainContent>
    </TabContent>
  );
}


