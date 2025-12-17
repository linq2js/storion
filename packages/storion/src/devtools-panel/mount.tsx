/**
 * Mount the devtools panel in a separate React root.
 *
 * This allows the devtools to render independently from the main app,
 * similar to how browser devtools extensions work.
 */

import { createRoot, type Root } from "react-dom/client";
import { DevtoolsPanel, type PanelPosition } from "./DevtoolsPanel";
import type { DevtoolsController } from "../devtools/types";

// ============================================================================
// Load stored settings (must match DevtoolsPanel storage)
// ============================================================================

const STORAGE_KEY = "storion-devtools-settings";

interface StoredSettings {
  position?: PanelPosition;
  collapsed?: boolean;
  size?: number;
}

function loadStoredSettings(): StoredSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

export interface MountOptions {
  /** Container element to mount into. If string, will query for element. */
  container?: HTMLElement | string;
  /** Position when creating default container */
  position?: PanelPosition;
  /** Initial height/width depending on position */
  size?: number;
  /** Z-index for the panel */
  zIndex?: number;
  /** Start collapsed */
  collapsed?: boolean;
}

let panelRoot: Root | null = null;
let panelContainer: HTMLElement | null = null;
let currentPosition: PanelPosition = "left";
let originalBodyPadding: string = "";

/**
 * Update body padding to prevent content overlap when panel is at bottom.
 */
function updateBodyPadding(
  position: PanelPosition,
  size: number,
  collapsed: boolean
) {
  if (position === "bottom" && !collapsed) {
    // Save original padding on first call
    if (!originalBodyPadding) {
      originalBodyPadding = document.body.style.paddingBottom || "";
    }
    document.body.style.paddingBottom = `${size}px`;
  } else {
    // Restore original padding
    document.body.style.paddingBottom = originalBodyPadding;
  }
}

/**
 * Reset body padding to original value.
 */
function resetBodyPadding() {
  document.body.style.paddingBottom = originalBodyPadding;
  originalBodyPadding = "";
}

// Track if panel was previously collapsed (for fade-in effect)
let wasCollapsed = false;

/**
 * Update container position and size.
 * When collapsed, move panel off-screen and show floating button.
 * When expanding, fade in the panel.
 */
function updateContainerPosition(
  position: PanelPosition,
  size: number,
  collapsed: boolean = false
) {
  if (!panelContainer) return;

  currentPosition = position;
  const isExpanding = wasCollapsed && !collapsed;
  wasCollapsed = collapsed;

  // Reset all position styles first
  panelContainer.style.top = "";
  panelContainer.style.right = "";
  panelContainer.style.bottom = "";
  panelContainer.style.left = "";
  panelContainer.style.width = "";
  panelContainer.style.height = "";
  panelContainer.style.borderTop = "";
  panelContainer.style.borderRight = "";
  panelContainer.style.borderBottom = "";
  panelContainer.style.borderLeft = "";

  if (collapsed) {
    // Hide panel off-screen (no transition when hiding)
    panelContainer.style.transition = "none";
    panelContainer.style.opacity = "1";
    panelContainer.style.left = "-9999px";
    panelContainer.style.top = "0";
    panelContainer.style.width = `${size}px`;
    panelContainer.style.height = "100vh";
    updateBodyPadding(position, size, true);
    return;
  }

  // Show panel normally

  // If expanding, start invisible for fade-in
  if (isExpanding) {
    panelContainer.style.transition = "none";
    panelContainer.style.opacity = "0";
  }

  if (position === "left") {
    panelContainer.style.top = "0";
    panelContainer.style.left = "0";
    panelContainer.style.width = `${size}px`;
    panelContainer.style.height = "100vh";
    panelContainer.style.borderRight = "1px solid #27272a";
  } else {
    // bottom
    panelContainer.style.bottom = "0";
    panelContainer.style.left = "0";
    panelContainer.style.right = "0";
    panelContainer.style.height = `${size}px`;
    panelContainer.style.width = "100%";
    panelContainer.style.borderTop = "1px solid #27272a";
  }

  // Trigger fade-in after position is set
  if (isExpanding) {
    // Force reflow to ensure transition works
    void panelContainer.offsetHeight;
    panelContainer.style.transition = "opacity 0.2s ease-out";
    panelContainer.style.opacity = "1";
  }

  // Update body padding for bottom position
  updateBodyPadding(position, size, collapsed);
}

/**
 * Update container size only (used for resize during drag).
 * Only updates size when not collapsed.
 */
function updateContainerSize(size: number) {
  if (!panelContainer) return;

  // Disable transitions for smooth resizing
  panelContainer.style.transition = "none";

  // Only update visible dimensions
  if (currentPosition === "bottom") {
    panelContainer.style.height = `${size}px`;
  } else {
    panelContainer.style.width = `${size}px`;
  }

  // Update body padding for bottom position
  updateBodyPadding(currentPosition, size, false);
}

/**
 * Mount the devtools panel.
 *
 * @example
 * ```ts
 * import { mountDevtoolsPanel } from "storion/devtools-panel";
 *
 * // Mount with default left panel
 * mountDevtoolsPanel();
 *
 * // Mount at bottom
 * mountDevtoolsPanel({ position: "bottom", size: 300 });
 *
 * // Mount at left
 * mountDevtoolsPanel({ position: "left", size: 400 });
 * ```
 */
export function mountDevtoolsPanel(options: MountOptions = {}): () => void {
  // Load stored settings first - stored settings take priority over options
  const stored = loadStoredSettings();

  const { container, zIndex = 999999 } = options;

  // Stored settings take priority, then options, then defaults
  const position: PanelPosition = stored.position ?? options.position ?? "left";
  const initialSize = stored.size ?? options.size ?? 360;
  const initialCollapsed = stored.collapsed ?? options.collapsed ?? false;

  currentPosition = position;

  // Get controller from window
  const controller = (window as any).__STORION_DEVTOOLS__ as
    | DevtoolsController
    | undefined;

  if (!controller) {
    console.warn(
      "[Storion Devtools] No devtools controller found. " +
        "Make sure to add devtoolsMiddleware to your container."
    );
    return () => {};
  }

  // Cleanup existing
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }
  if (panelContainer && !container) {
    panelContainer.remove();
    panelContainer = null;
  }

  // Get or create container
  let containerEl: HTMLElement;
  if (container) {
    if (typeof container === "string") {
      const el = document.querySelector(container);
      if (!el) {
        console.error(`[Storion Devtools] Container not found: ${container}`);
        return () => {};
      }
      containerEl = el as HTMLElement;
    } else {
      containerEl = container;
    }
  } else {
    // Create default container
    containerEl = document.createElement("div");
    containerEl.id = "storion-devtools-panel";

    const baseStyles: Record<string, string> = {
      position: "fixed",
      zIndex: String(zIndex),
      background: "#09090b",
      boxShadow: "0 0 20px rgba(0,0,0,0.5)",
      overflow: "hidden",
      display: "block",
    };

    // Initial position - will be updated by updateContainerPosition
    const positionStyles: Record<string, Record<string, string>> = {
      left: {
        top: "0",
        left: initialCollapsed ? "-9999px" : "0",
        width: `${initialSize}px`,
        height: "100vh",
        borderRight: "1px solid #27272a",
      },
      bottom: {
        bottom: initialCollapsed ? "-9999px" : "0",
        left: "0",
        right: "",
        height: `${initialSize}px`,
        width: "100%",
        borderTop: "1px solid #27272a",
      },
    };

    Object.assign(containerEl.style, baseStyles, positionStyles[position]);
    document.body.appendChild(containerEl);
    panelContainer = containerEl;

    // Set initial body padding for bottom position
    updateBodyPadding(position, initialSize, initialCollapsed);
  }

  let currentSize = initialSize;
  let isCollapsed = initialCollapsed;

  // Initialize wasCollapsed for fade-in effect
  wasCollapsed = initialCollapsed;

  // Handle resize from panel (only when not collapsed)
  const handleResize = (newSize: number) => {
    currentSize = newSize;
    if (!isCollapsed) {
      updateContainerSize(newSize);
    }
  };

  // Handle collapse from panel
  const handleCollapsedChange = (collapsed: boolean) => {
    isCollapsed = collapsed;
    updateContainerPosition(currentPosition, currentSize, collapsed);
  };

  // Handle position change from panel
  const handlePositionChange = (newPosition: PanelPosition) => {
    currentPosition = newPosition;
    updateContainerPosition(newPosition, currentSize, isCollapsed);
  };

  // Handle transparency change from panel
  const handleTransparencyChange = (transparent: boolean) => {
    if (!panelContainer) return;
    panelContainer.style.opacity = transparent ? "0.3" : "1";
  };

  // Create React root and render
  panelRoot = createRoot(containerEl);
  panelRoot.render(
    <DevtoolsPanel
      controller={controller}
      position={position}
      initialSize={initialSize}
      initialCollapsed={initialCollapsed}
      onCollapsedChange={handleCollapsedChange}
      onPositionChange={handlePositionChange}
      onTransparencyChange={handleTransparencyChange}
      onResize={handleResize}
    />
  );

  // Set up global error listeners
  const handleWindowError = (event: ErrorEvent) => {
    controller.recordEvent("error", "window", event.message, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
        ? reason
        : "Unhandled promise rejection";

    controller.recordEvent("error", "window", message, {
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      reason,
    });
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  // Return unmount function
  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);

    if (panelRoot) {
      panelRoot.unmount();
      panelRoot = null;
    }
    if (panelContainer) {
      panelContainer.remove();
      panelContainer = null;
    }
    resetBodyPadding();
  };
}

/**
 * Unmount the devtools panel.
 */
export function unmountDevtoolsPanel(): void {
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }
  if (panelContainer) {
    panelContainer.remove();
    panelContainer = null;
  }
  resetBodyPadding();
}

/**
 * Toggle the devtools panel visibility.
 */
export function toggleDevtoolsPanel(options?: MountOptions): void {
  if (panelRoot) {
    unmountDevtoolsPanel();
  } else {
    mountDevtoolsPanel(options);
  }
}
