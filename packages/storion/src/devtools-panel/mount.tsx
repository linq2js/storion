/**
 * Mount the devtools panel in a separate React root.
 *
 * This allows the devtools to render independently from the main app,
 * similar to how browser devtools extensions work.
 */

import { createRoot, type Root } from "react-dom/client";
import { DevtoolsPanel, type PanelPosition } from "./DevtoolsPanel";
import type { DevtoolsController } from "../devtools/types";

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
let floatingButton: HTMLElement | null = null;
let currentPosition: PanelPosition = "left";
let expandCallback: (() => void) | null = null;
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

/**
 * Create or update the floating button
 */
function createFloatingButton(zIndex: number, onClick: () => void) {
  if (floatingButton) {
    floatingButton.remove();
  }

  floatingButton = document.createElement("button");
  floatingButton.id = "storion-devtools-fab";

  Object.assign(floatingButton.style, {
    position: "fixed",
    bottom: "16px",
    left: "16px",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
    border: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    cursor: "pointer",
    zIndex: String(zIndex),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: "14px",
    fontWeight: "600",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  });

  floatingButton.innerHTML = "⚡";
  floatingButton.title = "Open Storion Devtools";

  floatingButton.addEventListener("mouseenter", () => {
    if (floatingButton) {
      floatingButton.style.transform = "scale(1.1)";
      floatingButton.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
    }
  });

  floatingButton.addEventListener("mouseleave", () => {
    if (floatingButton) {
      floatingButton.style.transform = "scale(1)";
      floatingButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
    }
  });

  floatingButton.addEventListener("click", onClick);
  document.body.appendChild(floatingButton);
}

/**
 * Show/hide floating button
 */
function setFloatingButtonVisible(visible: boolean) {
  if (floatingButton) {
    floatingButton.style.display = visible ? "flex" : "none";
  }
}

/**
 * Update container position and size.
 */
function updateContainerPosition(
  position: PanelPosition,
  size: number,
  collapsed: boolean = false
) {
  if (!panelContainer) return;

  currentPosition = position;

  if (collapsed) {
    panelContainer.style.display = "none";
    setFloatingButtonVisible(true);
    return;
  }

  panelContainer.style.display = "block";
  setFloatingButtonVisible(false);

  // Reset all position styles
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

  // Update body padding for bottom position
  updateBodyPadding(position, size, collapsed);
}

/**
 * Update container size only.
 */
function updateContainerSize(size: number, collapsed: boolean = false) {
  if (!panelContainer) return;

  // Always keep container visible - collapsed state is handled by CSS
  panelContainer.style.display = "block";
  setFloatingButtonVisible(false);

  if (collapsed) {
    // Collapsed: narrow strip for header only
    if (currentPosition === "bottom") {
      panelContainer.style.height = "40px";
    } else {
      panelContainer.style.width = "40px";
    }
  } else {
    // Expanded: full size
    if (currentPosition === "bottom") {
      panelContainer.style.height = `${size}px`;
    } else {
      panelContainer.style.width = `${size}px`;
    }
  }

  // Update body padding for bottom position
  updateBodyPadding(currentPosition, size, collapsed);
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
  const {
    container,
    position = "left",
    size: initialSize = 360,
    zIndex = 999999,
    collapsed: initialCollapsed = false,
  } = options;

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
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
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
      transition: "width 0.15s ease, height 0.15s ease",
      display: "block",
    };

    const collapsedSize = "40px";
    const positionStyles: Record<string, Record<string, string>> = {
      left: {
        top: "0",
        left: "0",
        width: initialCollapsed ? collapsedSize : `${initialSize}px`,
        height: "100vh",
        borderRight: "1px solid #27272a",
      },
      bottom: {
        bottom: "0",
        left: "0",
        right: "0",
        height: initialCollapsed ? collapsedSize : `${initialSize}px`,
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

  // Create expand callback for floating button
  expandCallback = () => {
    isCollapsed = false;
    updateContainerSize(currentSize, false);
    // Re-render with collapsed = false
    if (panelRoot) {
      panelRoot.render(
        <DevtoolsPanel
          controller={controller}
          position={currentPosition}
          initialSize={currentSize}
          initialCollapsed={false}
          onCollapsedChange={handleCollapsedChange}
          onPositionChange={handlePositionChange}
          onResize={handleResize}
        />
      );
    }
  };

  // Create floating button
  createFloatingButton(zIndex, () => expandCallback?.());

  // Floating button is no longer used - panel always visible in collapsed state
  setFloatingButtonVisible(false);

  // Handle resize from panel
  const handleResize = (newSize: number) => {
    currentSize = newSize;
    if (!isCollapsed) {
      updateContainerSize(newSize, false);
    }
  };

  // Handle collapse from panel
  const handleCollapsedChange = (collapsed: boolean) => {
    isCollapsed = collapsed;
    updateContainerSize(currentSize, collapsed);
  };

  // Handle position change from panel
  const handlePositionChange = (newPosition: PanelPosition) => {
    currentPosition = newPosition;
    updateContainerPosition(newPosition, currentSize, isCollapsed);
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
      onResize={handleResize}
    />
  );

  // Return unmount function
  return () => {
    if (panelRoot) {
      panelRoot.unmount();
      panelRoot = null;
    }
    if (panelContainer) {
      panelContainer.remove();
      panelContainer = null;
    }
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
    resetBodyPadding();
    expandCallback = null;
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
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
  resetBodyPadding();
  expandCallback = null;
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
