/**
 * Types for devtools panel.
 */

export type Tab = "stores" | "history" | "graph";

export interface PanelState {
  /** Currently active tab */
  activeTab: Tab;
  /** Search query */
  searchQuery: string;
  /** Selected store ID */
  selectedStoreId: string | null;
  /** Whether panel is collapsed */
  collapsed: boolean;
}

