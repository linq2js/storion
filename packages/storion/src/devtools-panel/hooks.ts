/**
 * Devtools Custom Hooks
 *
 * Reusable hooks for the devtools panel.
 */

import { useState, useEffect, useRef } from "react";
import type { DevtoolsEventType } from "../devtools/types";

// ============================================================================
// Settings Storage
// ============================================================================

const STORAGE_KEY = "storion-devtools-settings";

export type TabId = "stores" | "events";

export interface DevtoolsSettings {
  activeTab: TabId;
  collapsed: boolean;
  size: number;
  position: "left" | "bottom";
  storeSearchQuery: string;
  eventSearchQuery: string;
  eventFilters: DevtoolsEventType[] | null; // null = "All"
  sortByActivity: boolean; // Sort stores by recent activity
}

function loadSettings(): Partial<DevtoolsSettings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors (SSR, localStorage disabled, etc.)
  }
  return {};
}

function saveSettings(settings: Partial<DevtoolsSettings>): void {
  try {
    const current = loadSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore errors
  }
}

/** Clear all devtools settings from localStorage */
export function clearDevtoolsSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// usePersistentState Hook
// ============================================================================

/**
 * Hook to persist a single setting to localStorage
 */
export function usePersistentState<T>(
  key: keyof DevtoolsSettings,
  initialValue: T,
  transform?: {
    toStorage?: (value: T) => unknown;
    fromStorage?: (stored: unknown) => T;
  }
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = loadSettings();
    if (key in stored) {
      const storedValue = stored[key];
      return transform?.fromStorage
        ? transform.fromStorage(storedValue)
        : (storedValue as T);
    }
    return initialValue;
  });

  // Persist to localStorage whenever value changes (skip initial mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const toStore = transform?.toStorage ? transform.toStorage(value) : value;
    saveSettings({ [key]: toStore });
  }, [value, key, transform]);

  return [value, setValue];
}

