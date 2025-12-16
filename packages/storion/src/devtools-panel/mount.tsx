/**
 * Mount the devtools panel in a separate React root.
 *
 * This allows the devtools to render independently from the main app,
 * similar to how browser devtools extensions work.
 */

import { createRoot, type Root } from "react-dom/client";
import { DevtoolsPanel } from "./DevtoolsPanel";
import type { DevtoolsController } from "../devtools/types";

export interface MountOptions {
  /** Container element to mount into. If string, will query for element. */
  container?: HTMLElement | string;
  /** Position when creating default container */
  position?: "bottom" | "right" | "left";
  /** Initial height/width depending on position */
  size?: number;
  /** Z-index for the panel */
  zIndex?: number;
  /** Start collapsed */
  collapsed?: boolean;
}

let panelRoot: Root | null = null;
let panelContainer: HTMLElement | null = null;
let currentPosition: "bottom" | "right" | "left" = "right";

/**
 * Update container size.
 */
function updateContainerSize(size: number, collapsed: boolean = false) {
  if (!panelContainer) return;

  if (collapsed) {
    if (currentPosition === "bottom") {
      panelContainer.style.height = "40px";
    } else {
      panelContainer.style.width = "40px";
    }
  } else {
    if (currentPosition === "bottom") {
      panelContainer.style.height = `${size}px`;
    } else {
      panelContainer.style.width = `${size}px`;
    }
  }
}

/**
 * Mount the devtools panel.
 *
 * @example
 * ```ts
 * import { mountDevtoolsPanel } from "storion/devtools-panel";
 *
 * // Mount with default right panel
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
    position = "right",
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

    const sizeValue = initialCollapsed ? "40px" : `${initialSize}px`;

    const baseStyles: Record<string, string> = {
      position: "fixed",
      zIndex: String(zIndex),
      background: "#0f172a",
      boxShadow: "0 0 20px rgba(0,0,0,0.5)",
      overflow: "hidden",
      transition: "width 0.15s ease, height 0.15s ease",
    };

    const positionStyles: Record<string, Record<string, string>> = {
      right: {
        top: "0",
        right: "0",
        width: sizeValue,
        height: "100vh",
        borderLeft: "1px solid #334155",
      },
      left: {
        top: "0",
        left: "0",
        width: sizeValue,
        height: "100vh",
        borderRight: "1px solid #334155",
      },
      bottom: {
        bottom: "0",
        left: "0",
        right: "0",
        height: sizeValue,
        width: "100%",
        borderTop: "1px solid #334155",
      },
    };

    Object.assign(containerEl.style, baseStyles, positionStyles[position]);
    document.body.appendChild(containerEl);
    panelContainer = containerEl;
  }

  let currentSize = initialSize;

  // Handle resize from panel
  const handleResize = (newSize: number) => {
    currentSize = newSize;
    updateContainerSize(newSize, false);
  };

  // Handle collapse from panel
  const handleCollapsedChange = (collapsed: boolean) => {
    updateContainerSize(currentSize, collapsed);
  };

  // Create React root and render
  panelRoot = createRoot(containerEl);
  panelRoot.render(
    <DevtoolsPanel
      controller={controller}
      position={position}
      initialSize={initialSize}
      onCollapsedChange={handleCollapsedChange}
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
