/**
 * CSS styles for devtools panel.
 * Using CSS-in-JS for portability.
 */

export const colors = {
  // Dark theme
  bg: {
    primary: "#0f172a", // slate-900
    secondary: "#1e293b", // slate-800
    tertiary: "#334155", // slate-700
    hover: "#475569", // slate-600
  },
  text: {
    primary: "#f8fafc", // slate-50
    secondary: "#94a3b8", // slate-400
    muted: "#64748b", // slate-500
  },
  accent: {
    purple: "#a78bfa", // violet-400
    blue: "#60a5fa", // blue-400
    green: "#4ade80", // green-400
    yellow: "#facc15", // yellow-400
    red: "#f87171", // red-400
    cyan: "#22d3ee", // cyan-400
  },
  border: "#334155", // slate-700
};

export const panelStyles = `
  .storion-devtools {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    color: ${colors.text.primary};
    background: ${colors.bg.primary};
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .storion-devtools * {
    box-sizing: border-box;
  }

  /* Header */
  .sdt-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid ${colors.border};
    background: ${colors.bg.secondary};
    flex-shrink: 0;
  }

  .sdt-logo {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sdt-logo-icon {
    width: 20px;
    height: 20px;
    background: linear-gradient(135deg, ${colors.accent.purple}, ${colors.accent.blue});
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 10px;
  }

  .sdt-title {
    font-weight: 600;
    color: ${colors.text.primary};
  }

  .sdt-header-actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .sdt-btn {
    background: transparent;
    border: none;
    color: ${colors.text.secondary};
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .sdt-btn:hover {
    background: ${colors.bg.tertiary};
    color: ${colors.text.primary};
  }

  /* Tab Content Container */
  .sdt-tab-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  /* Search */
  .sdt-search {
    padding: 8px 12px;
    border-bottom: 1px solid ${colors.border};
    flex-shrink: 0;
  }

  .sdt-search-input {
    width: 100%;
    padding: 8px 12px;
    background: ${colors.bg.secondary};
    border: 1px solid ${colors.border};
    border-radius: 6px;
    color: ${colors.text.primary};
    font-size: 12px;
    outline: none;
  }

  .sdt-search-input:focus {
    border-color: ${colors.accent.purple};
  }

  .sdt-search-input::placeholder {
    color: ${colors.text.muted};
  }

  /* Filter Bar */
  .sdt-filter-bar {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid ${colors.border};
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .sdt-filter-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    background: ${colors.bg.tertiary};
    color: ${colors.text.secondary};
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sdt-filter-item:hover {
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
  }

  .sdt-filter-item.active {
    background: ${colors.accent.purple};
    color: white;
  }

  .sdt-filter-item .count {
    background: rgba(0,0,0,0.2);
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 600;
  }

  /* Action Bar */
  .sdt-action-bar {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid ${colors.border};
    flex-shrink: 0;
  }

  .sdt-action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 11px;
    background: ${colors.bg.tertiary};
    color: ${colors.text.secondary};
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sdt-action-btn:hover:not(:disabled) {
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
  }

  .sdt-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Main Content */
  .sdt-main-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  /* Store List */
  .sdt-store-entry {
    background: ${colors.bg.secondary};
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
    border: 1px solid ${colors.border};
    transition: all 0.15s ease;
  }

  .sdt-store-entry:hover {
    border-color: ${colors.accent.purple};
  }

  .sdt-store-entry.selected {
    border-color: ${colors.accent.purple};
    box-shadow: 0 0 0 1px ${colors.accent.purple};
  }

  .sdt-store-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    cursor: pointer;
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
    border-radius: 4px;
    transition: all 0.15s;
  }

  .sdt-expand-btn:hover {
    background: ${colors.bg.tertiary};
    color: ${colors.text.primary};
  }

  .sdt-store-name {
    font-weight: 600;
    color: ${colors.text.primary};
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sdt-store-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .sdt-store-header:hover .sdt-store-actions {
    opacity: 1;
  }

  /* Store Details */
  .sdt-store-details {
    padding: 12px;
    border-top: 1px solid ${colors.border};
    background: ${colors.bg.primary};
  }

  .sdt-section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: ${colors.text.muted};
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .sdt-state-tree {
    font-family: inherit;
  }

  .sdt-state-key {
    color: ${colors.accent.purple};
  }

  .sdt-state-value {
    color: ${colors.accent.green};
  }

  .sdt-state-value.string { color: ${colors.accent.yellow}; }
  .sdt-state-value.number { color: ${colors.accent.blue}; }
  .sdt-state-value.boolean { color: ${colors.accent.red}; }
  .sdt-state-value.null { color: ${colors.text.muted}; }

  /* History */
  .sdt-history {
    margin-top: 12px;
  }

  .sdt-history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: background 0.15s;
  }

  .sdt-history-item:hover {
    background: ${colors.bg.tertiary};
  }

  .sdt-history-item.init {
    background: ${colors.bg.tertiary};
    border-left: 2px solid ${colors.accent.green};
  }

  .sdt-history-time {
    color: ${colors.text.secondary};
    font-size: 11px;
    flex: 1;
  }

  .sdt-history-item.init .sdt-history-time {
    color: ${colors.accent.green};
    font-weight: 600;
  }

  .sdt-history-badge {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 3px;
    background: ${colors.accent.green};
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .sdt-history-revert {
    background: ${colors.accent.purple};
    color: white;
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .sdt-history-item:hover .sdt-history-revert {
    opacity: 1;
  }

  .sdt-history-expand {
    display: flex;
    justify-content: center;
    padding: 8px;
  }

  .sdt-history-expand-btn {
    background: ${colors.bg.tertiary};
    border: none;
    color: ${colors.text.secondary};
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }

  .sdt-history-expand-btn:hover {
    background: ${colors.bg.hover};
    color: ${colors.text.primary};
  }

  /* Metadata Section */
  .sdt-metadata {
    margin-top: 12px;
    padding: 10px;
    background: ${colors.bg.tertiary};
    border-radius: 6px;
  }

  .sdt-metadata-row {
    display: flex;
    margin-bottom: 6px;
    font-size: 11px;
  }

  .sdt-metadata-row:last-child {
    margin-bottom: 0;
  }

  .sdt-metadata-label {
    color: ${colors.text.muted};
    min-width: 80px;
    flex-shrink: 0;
  }

  .sdt-metadata-value {
    color: ${colors.text.secondary};
    word-break: break-all;
  }

  .sdt-metadata-value.code-location {
    color: ${colors.accent.cyan};
    font-size: 10px;
  }

  /* Resize Handle */
  .sdt-resize-handle {
    position: absolute;
    background: transparent;
    z-index: 10;
    transition: background 0.15s;
  }

  .sdt-resize-handle:hover,
  .sdt-resize-handle.active {
    background: ${colors.accent.purple};
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

  .sdt-resize-handle.left {
    left: 0;
  }

  .sdt-resize-handle.right {
    right: 0;
  }

  .sdt-resize-handle.top {
    top: 0;
  }

  .sdt-resize-handle.bottom {
    bottom: 0;
  }

  /* Code Location */
  .sdt-code-location {
    margin-top: 12px;
    padding: 8px;
    background: ${colors.bg.tertiary};
    border-radius: 4px;
    font-size: 10px;
    color: ${colors.text.muted};
    word-break: break-all;
  }

  /* Empty State */
  .sdt-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: ${colors.text.muted};
    text-align: center;
  }

  .sdt-empty-icon {
    font-size: 32px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  /* Collapsed Panel */
  .storion-devtools.collapsed {
    width: 40px !important;
    min-width: 40px !important;
  }

  .storion-devtools.collapsed .sdt-header {
    flex-direction: column;
    padding: 8px 4px;
  }

  .storion-devtools.collapsed .sdt-title,
  .storion-devtools.collapsed .sdt-tab-content {
    display: none;
  }

  .storion-devtools.collapsed .sdt-header-actions {
    margin-left: 0;
    flex-direction: column;
  }

  /* Position-specific styles */
  .storion-devtools.position-bottom {
    flex-direction: column;
  }

  .storion-devtools.position-bottom.collapsed {
    height: 40px !important;
    min-height: 40px !important;
    width: 100% !important;
  }

  .storion-devtools.position-bottom.collapsed .sdt-header {
    flex-direction: row;
  }

  .storion-devtools.position-bottom.collapsed .sdt-header-actions {
    flex-direction: row;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .storion-devtools {
      font-size: 11px;
    }
    
    .sdt-header {
      padding: 6px 8px;
    }

    .sdt-search {
      padding: 6px 8px;
    }

    .sdt-search-input {
      padding: 6px 10px;
    }

    .sdt-main-content {
      padding: 6px;
    }

    .sdt-store-header {
      padding: 8px 10px;
    }

    .sdt-store-details {
      padding: 10px;
    }

    .sdt-history-item {
      padding: 5px 6px;
    }
  }

  @media (max-width: 480px) {
    .sdt-title {
      font-size: 11px;
    }

    .sdt-logo-icon {
      width: 16px;
      height: 16px;
      font-size: 8px;
    }
  }
`;
