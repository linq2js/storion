/**
 * Storion Devtools Panel
 *
 * UI components for the devtools panel.
 * Renders in its own React root, separate from the main app.
 *
 * @example
 * ```tsx
 * import { mountDevtoolsPanel } from "storion/devtools-panel";
 *
 * // Mount devtools panel
 * mountDevtoolsPanel();
 *
 * // Or with options
 * mountDevtoolsPanel({
 *   position: "right",  // "left" | "right" | "bottom"
 *   size: 400,
 * });
 * ```
 */

export {
  DevtoolsPanel,
  clearDevtoolsSettings,
  type DevtoolsPanelProps,
  type PanelPosition,
} from "./DevtoolsPanel";
export {
  mountDevtoolsPanel,
  unmountDevtoolsPanel,
  toggleDevtoolsPanel,
  type MountOptions,
} from "./mount";

// Reusable tab layout components
export {
  SearchBar,
  FilterBar,
  ActionBar,
  MainContent,
  TabContent,
} from "./components/TabLayout";

export type { Tab, PanelState } from "./types";
