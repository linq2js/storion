/**
 * CSS styles for devtools panel.
 * shadcn UI inspired theme with clean, minimal design.
 *
 * Font strategy:
 * - Sans-serif (Inter/system) for UI labels, buttons, headings
 * - Monospace for data values, timestamps, code, inputs
 */

export const colors = {
  // Dark theme - zinc palette inspired by shadcn
  bg: {
    base: "#09090b", // zinc-950
    card: "#18181b", // zinc-900
    elevated: "#27272a", // zinc-800
    hover: "#3f3f46", // zinc-700
    muted: "#52525b", // zinc-600
  },
  text: {
    primary: "#fafafa", // zinc-50
    secondary: "#a1a1aa", // zinc-400
    muted: "#71717a", // zinc-500
    dim: "#52525b", // zinc-600
  },
  border: {
    default: "#27272a", // zinc-800
    subtle: "#3f3f46", // zinc-700
    focus: "#a1a1aa", // zinc-400
  },
  // Accent colors for syntax highlighting
  syntax: {
    key: "#e879f9", // fuchsia-400
    string: "#fbbf24", // amber-400
    number: "#60a5fa", // blue-400
    boolean: "#f472b6", // pink-400
    null: "#71717a", // zinc-500
  },
  // UI accents
  accent: {
    primary: "#a1a1aa", // zinc-400
    success: "#4ade80", // green-400
    warning: "#fbbf24", // amber-400
    danger: "#f87171", // red-400
    info: "#38bdf8", // sky-400
  },
};

// Font stacks
const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

export const panelStyles = `
  /* ============================================
     Base & Reset
     ============================================ */
  .storion-devtools {
    font-family: ${fonts.sans};
    font-size: 12px;
    line-height: 1.4;
    color: ${colors.text.primary};
    background: ${colors.bg.base};
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .storion-devtools * {
    box-sizing: border-box;
  }

  /* ============================================
     Header
     ============================================ */
  .sdt-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid ${colors.border.default};
    background: ${colors.bg.card};
    flex-shrink: 0;
  }

  .sdt-logo {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sdt-logo-icon {
    width: 18px;
    height: 18px;
    background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 10px;
    font-weight: 600;
  }

  .sdt-title {
    font-size: 12px;
    font-weight: 600;
    color: ${colors.text.primary};
    letter-spacing: -0.01em;
  }

  .sdt-header-actions {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  /* ============================================
     Buttons
     ============================================ */
  .sdt-btn {
    background: transparent;
    border: 1px solid transparent;
    color: ${colors.text.secondary};
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-family: ${fonts.sans};
    font-size: 11px;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .sdt-btn:hover {
    background: ${colors.bg.elevated};
    color: ${colors.text.primary};
  }

  .sdt-btn:active {
    background: ${colors.bg.hover};
  }

  .sdt-btn-primary {
    background: ${colors.text.primary};
    color: ${colors.bg.base};
  }

  .sdt-btn-primary:hover {
    background: ${colors.text.secondary};
    color: ${colors.bg.base};
  }

  .sdt-btn-ghost {
    background: transparent;
    border-color: ${colors.border.subtle};
  }

  .sdt-btn-ghost:hover {
    background: ${colors.bg.elevated};
    border-color: ${colors.border.focus};
  }

  .sdt-btn-toggle {
    background: transparent;
    border: 1px solid ${colors.border.default};
    color: ${colors.text.muted};
  }

  .sdt-btn-toggle:hover {
    background: ${colors.bg.elevated};
    color: ${colors.text.secondary};
  }

  .sdt-btn-toggle.active {
    background: ${colors.bg.elevated};
    border-color: ${colors.accent.info};
    color: ${colors.accent.info};
  }

  .sdt-btn-toggle.active:hover {
    background: ${colors.bg.hover};
  }

  /* Stores action bar */
  .sdt-stores-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid ${colors.border.default};
  }

  /* ============================================
     Tab Content Container
     ============================================ */
  .sdt-tab-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  /* ============================================
     Search Input
     ============================================ */
  .sdt-search {
    position: relative;
    display: flex;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid ${colors.border.default};
    flex-shrink: 0;
  }

  .sdt-search-icon {
    position: absolute;
    left: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${colors.text.muted};
    pointer-events: none;
    z-index: 1;
  }

  .sdt-search-input {
    width: 100%;
    padding: 5px 28px 5px 28px;
    background: ${colors.bg.card};
    border: 1px solid ${colors.border.default};
    border-radius: 4px;
    color: ${colors.text.primary};
    font-family: ${fonts.mono};
    font-size: 11px;
    outline: none;
    transition: all 0.15s ease;
  }

  .sdt-search-input:hover {
    border-color: ${colors.border.subtle};
  }

  .sdt-search-input:focus {
    border-color: ${colors.border.focus};
    box-shadow: 0 0 0 1px rgba(161, 161, 170, 0.1);
  }

  .sdt-search-input::placeholder {
    color: ${colors.text.dim};
    font-family: ${fonts.sans};
  }

  .sdt-search-clear {
    position: absolute;
    right: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 2px;
    color: ${colors.text.muted};
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sdt-search-clear:hover {
    color: ${colors.text.primary};
    background: ${colors.bg.elevated};
  }

  /* ============================================
     Filter Bar
     ============================================ */
  .sdt-filter-bar {
    display: flex;
    gap: 4px;
    padding: 5px 8px;
    border-bottom: 1px solid ${colors.border.default};
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .sdt-filter-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ${fonts.sans};
    font-size: 10px;
    font-weight: 500;
    background: ${colors.bg.elevated};
    color: ${colors.text.secondary};
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sdt-filter-item:hover {
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
  }

  .sdt-filter-item.active {
    background: ${colors.text.primary};
    color: ${colors.bg.base};
  }

  .sdt-filter-item .count {
    font-family: ${fonts.mono};
    background: rgba(0, 0, 0, 0.2);
    padding: 0px 4px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  /* ============================================
     Action Bar
     ============================================ */
  .sdt-action-bar {
    display: flex;
    gap: 4px;
    padding: 5px 8px;
    border-bottom: 1px solid ${colors.border.default};
    flex-shrink: 0;
  }

  .sdt-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: ${fonts.sans};
    font-size: 10px;
    font-weight: 500;
    background: ${colors.bg.elevated};
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.default};
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sdt-action-btn:hover:not(:disabled) {
    background: ${colors.bg.hover};
    border-color: ${colors.border.subtle};
    color: ${colors.text.primary};
  }

  .sdt-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ============================================
     Main Content
     ============================================ */
  .sdt-main-content {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;
  }

  /* Custom scrollbar */
  .sdt-main-content::-webkit-scrollbar {
    width: 6px;
  }

  .sdt-main-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .sdt-main-content::-webkit-scrollbar-thumb {
    background: ${colors.bg.muted};
    border-radius: 3px;
  }

  .sdt-main-content::-webkit-scrollbar-thumb:hover {
    background: ${colors.text.muted};
  }

  /* ============================================
     Store Entry Card
     ============================================ */
  .sdt-store-entry {
    background: ${colors.bg.card};
    border-radius: 6px;
    margin-bottom: 4px;
    overflow: hidden;
    border: 1px solid ${colors.border.default};
    transition: all 0.15s ease;
  }

  .sdt-store-entry:hover {
    border-color: ${colors.border.subtle};
  }

  .sdt-store-entry.selected {
    border-color: ${colors.accent.primary};
  }

  .sdt-store-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .sdt-store-header:hover {
    background: ${colors.bg.elevated};
  }

  /* Flash animation for store header */
  @keyframes sdt-store-flash {
    0% { background-color: rgba(168, 85, 247, 0.25); }
    100% { background-color: transparent; }
  }

  .sdt-store-header.flash {
    animation: sdt-store-flash 0.5s ease-out;
  }

  .sdt-expand-btn {
    background: transparent;
    border: none;
    color: ${colors.text.muted};
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .sdt-expand-btn:hover {
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
  }

  .sdt-store-name {
    font-family: ${fonts.mono};
    font-size: 11px;
    font-weight: 500;
    color: ${colors.text.primary};
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sdt-store-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sdt-store-header:hover .sdt-store-actions {
    opacity: 1;
  }

  /* ============================================
     Store Details
     ============================================ */
  .sdt-store-details {
    padding: 8px;
    border-top: 1px solid ${colors.border.default};
    background: ${colors.bg.base};
  }

  .sdt-section-title {
    font-family: ${fonts.sans};
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${colors.text.muted};
    margin-bottom: 6px;
  }

  /* ============================================
     State JSON Textarea
     ============================================ */
  .sdt-state-json {
    font-family: ${fonts.mono};
    font-size: 11px;
    line-height: 1.4;
    width: 100%;
    min-height: 160px;
    max-height: 400px;
    padding: 6px 8px;
    background: ${colors.bg.elevated};
    border: 1px solid ${colors.border};
    border-radius: 4px;
    color: ${colors.text.secondary};
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }

  .sdt-state-json:focus {
    border-color: ${colors.accent};
  }

  /* Keep state-value for metadata section */
  .sdt-state-value {
    color: ${colors.syntax.string};
  }

  .sdt-state-value.string {
    color: ${colors.syntax.string};
  }

  .sdt-state-value.number {
    color: ${colors.syntax.number};
  }

  .sdt-state-value.boolean {
    color: ${colors.syntax.boolean};
  }

  .sdt-state-value.null {
    color: ${colors.syntax.null};
    font-style: italic;
  }

  .sdt-state-value.object {
    color: ${colors.text.secondary};
  }

  /* ============================================
     History
     ============================================ */
  .sdt-history {
    margin-top: 8px;
  }

  .sdt-history-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    margin-bottom: 2px;
    transition: background 0.15s ease;
    border: 1px solid transparent;
  }

  .sdt-history-item:hover {
    background: ${colors.bg.elevated};
  }

  .sdt-history-index {
    font-family: ${fonts.mono};
    font-size: 10px;
    color: ${colors.text.dim};
    min-width: 24px;
  }

  .sdt-history-time {
    font-family: ${fonts.mono};
    font-size: 10px;
    color: ${colors.text.secondary};
    white-space: nowrap;
  }

  .sdt-history-props {
    font-family: ${fonts.mono};
    font-size: 10px;
    color: ${colors.text.muted};
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sdt-history-revert {
    font-family: ${fonts.sans};
    font-size: 10px;
    font-weight: 500;
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
    border: 1px solid ${colors.border.subtle};
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
  }

  .sdt-history-item:hover .sdt-history-revert {
    opacity: 1;
  }

  .sdt-history-revert:hover {
    background: ${colors.text.primary};
    color: ${colors.bg.base};
    border-color: ${colors.text.primary};
  }

  .sdt-history-expand {
    display: flex;
    justify-content: center;
    padding: 4px;
  }

  .sdt-history-expand-btn {
    font-family: ${fonts.sans};
    font-size: 10px;
    font-weight: 500;
    background: transparent;
    border: 1px solid ${colors.border.default};
    color: ${colors.text.secondary};
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sdt-history-expand-btn:hover {
    background: ${colors.bg.elevated};
    border-color: ${colors.border.subtle};
    color: ${colors.text.primary};
  }

  /* ============================================
     Metadata Section
     ============================================ */
  .sdt-metadata {
    margin-top: 8px;
    padding: 6px 8px;
    background: ${colors.bg.elevated};
    border-radius: 4px;
    border: 1px solid ${colors.border.default};
  }

  .sdt-metadata-row {
    display: flex;
    align-items: baseline;
    margin-bottom: 3px;
    font-size: 10px;
  }

  .sdt-metadata-row:last-child {
    margin-bottom: 0;
  }

  .sdt-metadata-label {
    font-family: ${fonts.sans};
    font-weight: 500;
    color: ${colors.text.muted};
    min-width: 60px;
    flex-shrink: 0;
  }

  .sdt-metadata-value {
    font-family: ${fonts.mono};
    color: ${colors.text.secondary};
    word-break: break-all;
  }

  .sdt-metadata-value.code-location {
    color: ${colors.accent.info};
    font-size: 10px;
  }

  /* ============================================
     Resize Handle
     ============================================ */
  .sdt-resize-handle {
    position: absolute;
    background: transparent;
    z-index: 10;
    transition: background 0.15s ease;
    /* Increase hit area for easier grabbing */
    padding: 0;
  }

  .sdt-resize-handle:hover,
  .sdt-resize-handle.active {
    background: ${colors.accent.primary};
  }

  .sdt-resize-handle.horizontal {
    width: 4px;
    height: 100%;
    top: 0;
    cursor: ew-resize;
  }

  .sdt-resize-handle.vertical {
    height: 4px;
    width: 100%;
    left: 0;
    cursor: ns-resize;
  }

  .sdt-resize-handle.left { left: 0; }
  .sdt-resize-handle.right { right: 0; }
  .sdt-resize-handle.top { top: 0; }
  .sdt-resize-handle.bottom { bottom: 0; }

  /* ============================================
     Empty State
     ============================================ */
  .sdt-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 12px;
    color: ${colors.text.muted};
    text-align: center;
  }

  .sdt-empty-icon {
    font-size: 28px;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .sdt-empty-message {
    font-family: ${fonts.sans};
    font-size: 12px;
    font-weight: 500;
    color: ${colors.text.secondary};
    margin-bottom: 4px;
  }

  .sdt-empty-hint {
    font-family: ${fonts.sans};
    font-size: 11px;
    color: ${colors.text.muted};
  }

  /* ============================================
     Position Variants
     ============================================ */
  .storion-devtools.position-bottom {
    flex-direction: column;
  }

  /* When bottom position and wide screen, display stores in 2 columns */
  .storion-devtools.position-bottom .sdt-main-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 4px;
    align-content: start;
    overflow-y: auto; /* Ensure scrolling still works */
  }

  .storion-devtools.position-bottom .sdt-store-entry {
    margin-bottom: 0;
    height: fit-content; /* Prevent grid from stretching items */
  }

  /* ============================================
     Tabs
     ============================================ */
  .sdt-tabs {
    display: flex;
    border-bottom: 1px solid ${colors.border.default};
    background: ${colors.bg.card};
    padding: 0 4px;
    gap: 2px;
  }

  .sdt-tab {
    font-family: ${fonts.sans};
    font-size: 11px;
    font-weight: 500;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: ${colors.text.muted};
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: color 0.15s, border-color 0.15s;
  }

  .sdt-tab:hover {
    color: ${colors.text.secondary};
  }

  .sdt-tab.active {
    color: ${colors.text.primary};
    border-bottom-color: ${colors.accent.primary};
  }

  .sdt-tab-count {
    font-family: ${fonts.mono};
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    background: ${colors.bg.elevated};
    color: ${colors.text.muted};
  }

  .sdt-tab.active .sdt-tab-count {
    background: ${colors.bg.hover};
    color: ${colors.text.secondary};
  }

  /* Flash animation for tabs */
  @keyframes sdt-flash {
    0% { background-color: rgba(168, 85, 247, 0.3); }
    100% { background-color: transparent; }
  }

  .sdt-tab.flash {
    animation: sdt-flash 0.6s ease-out;
  }

  .sdt-tab.flash .sdt-tab-count {
    animation: sdt-flash 0.6s ease-out;
  }

  /* ============================================
     Event Entry
     ============================================ */
  .sdt-event-entry {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid ${colors.border.default};
    font-family: ${fonts.mono};
    font-size: 10px;
    min-height: 28px;
    max-height: 44px;
    overflow: hidden;
  }

  .sdt-event-entry:hover {
    background: ${colors.bg.elevated};
  }

  .sdt-event-time {
    color: ${colors.text.muted};
    font-size: 10px;
    flex-shrink: 0;
    width: 56px;
  }

  .sdt-event-type {
    font-family: ${fonts.sans};
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .sdt-event-target {
    color: ${colors.text.secondary};
    flex-shrink: 0;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sdt-event-target.clickable {
    cursor: pointer;
    color: ${colors.accent.info};
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
  }

  .sdt-event-target.clickable:hover {
    text-decoration-color: ${colors.accent.info};
  }

  .sdt-event-extra {
    color: ${colors.text.muted};
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .sdt-event-copy {
    background: transparent;
    border: none;
    color: ${colors.text.dim};
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
  }

  .sdt-event-entry:hover .sdt-event-copy {
    opacity: 1;
  }

  .sdt-event-copy:hover {
    color: ${colors.text.secondary};
    background: ${colors.bg.hover};
  }

  /* ============================================
     Event Filter Bar
     ============================================ */
  .sdt-event-filters {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid ${colors.border.default};
    background: ${colors.bg.card};
  }

  .sdt-event-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex: 1;
  }

  .sdt-event-filter-chip {
    font-family: ${fonts.sans};
    font-size: 9px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid ${colors.border.default};
    background: transparent;
    color: ${colors.text.muted};
    cursor: pointer;
    transition: all 0.15s;
  }

  .sdt-event-filter-chip:hover {
    border-color: ${colors.border.subtle};
    color: ${colors.text.secondary};
  }

  .sdt-event-filter-chip.active {
    color: ${colors.text.primary};
  }

  .sdt-event-clear-btn {
    background: transparent;
    border: none;
    color: ${colors.text.muted};
    cursor: pointer;
    padding: 4px;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
  }

  .sdt-event-clear-btn:hover {
    color: ${colors.accent.danger};
    background: ${colors.bg.elevated};
  }

  /* ============================================
     Floating Button (Collapsed State)
     ============================================ */
  .sdt-floating-btn {
    position: fixed;
    bottom: 16px;
    left: 16px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: ${colors.bg.card};
    border: 1px solid ${colors.border.default};
    color: ${colors.text.primary};
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
    z-index: 999999;
  }

  .sdt-floating-btn:hover {
    background: ${colors.bg.elevated};
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .sdt-floating-btn:active {
    transform: scale(0.95);
  }

  /* ============================================
     Responsive
     ============================================ */
  @media (max-width: 768px) {
    .storion-devtools {
      font-size: 11px;
    }

    .sdt-header {
      padding: 5px 6px;
    }

    .sdt-search {
      padding: 5px 6px;
    }

    .sdt-main-content {
      padding: 5px 6px;
    }

    .sdt-store-header {
      padding: 5px 6px;
    }

    .sdt-store-details {
      padding: 6px;
    }
  }
`;
