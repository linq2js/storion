/**
 * Unified Tab Layout Components
 *
 * Reusable components for consistent tab content layout:
 * - SearchBar (optional)
 * - FilterBar (optional)
 * - ActionBar (optional)
 * - MainContent / List
 */

import { memo, useCallback, type ReactNode } from "react";

// ============================================================================
// Icons
// ============================================================================

const IconSearch = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
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
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// ============================================================================
// Search Bar
// ============================================================================

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const SearchBar = memo(function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  autoFocus = false,
}: SearchBarProps) {
  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  return (
    <div className="sdt-search">
      <div className="sdt-search-icon">
        <IconSearch />
      </div>
      <input
        type="text"
        className="sdt-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          className="sdt-search-clear"
          onClick={handleClear}
          title="Clear search"
          type="button"
        >
          <IconClear />
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Filter Bar
// ============================================================================

interface FilterItem {
  key: string;
  label: string;
  count?: number;
  active?: boolean;
}

interface FilterBarProps {
  filters: FilterItem[];
  onToggle: (key: string) => void;
}

export const FilterBar = memo(function FilterBar({
  filters,
  onToggle,
}: FilterBarProps) {
  if (filters.length === 0) return null;

  return (
    <div className="sdt-filter-bar">
      {filters.map((filter) => (
        <button
          key={filter.key}
          className={`sdt-filter-item ${filter.active ? "active" : ""}`}
          onClick={() => onToggle(filter.key)}
        >
          <span>{filter.label}</span>
          {filter.count !== undefined && (
            <span className="count">{filter.count}</span>
          )}
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// Action Bar
// ============================================================================

interface ActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ActionBarProps {
  actions: ActionItem[];
}

export const ActionBar = memo(function ActionBar({ actions }: ActionBarProps) {
  if (actions.length === 0) return null;

  return (
    <div className="sdt-action-bar">
      {actions.map((action) => (
        <button
          key={action.key}
          className="sdt-action-btn"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.label}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// Main Content / List Container
// ============================================================================

interface MainContentProps {
  children: ReactNode;
  isEmpty?: boolean;
  emptyIcon?: string;
  emptyMessage?: string;
  emptyHint?: string;
}

export const MainContent = memo(function MainContent({
  children,
  isEmpty,
  emptyIcon = "📦",
  emptyMessage = "No items found",
  emptyHint,
}: MainContentProps) {
  if (isEmpty) {
    return (
      <div className="sdt-main-content">
        <div className="sdt-empty">
          <div className="sdt-empty-icon">{emptyIcon}</div>
          <div className="sdt-empty-message">{emptyMessage}</div>
          {emptyHint && <div className="sdt-empty-hint">{emptyHint}</div>}
        </div>
      </div>
    );
  }

  return <div className="sdt-main-content">{children}</div>;
});

// ============================================================================
// Tab Content Container
// ============================================================================

interface TabContentProps {
  searchBar?: ReactNode;
  filterBar?: ReactNode;
  actionBar?: ReactNode;
  children: ReactNode;
}

export const TabContent = memo(function TabContent({
  searchBar,
  filterBar,
  actionBar,
  children,
}: TabContentProps) {
  return (
    <div className="sdt-tab-content">
      {searchBar}
      {filterBar}
      {actionBar}
      {children}
    </div>
  );
});
