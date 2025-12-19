/**
 * React Context for Store Container
 */

import {
  createContext,
  useContext,
  createElement,
  type ReactNode,
  type FC,
  useMemo,
  memo,
} from "react";

import type { StoreContainer } from "../types";
import { container } from "../core/container";
import { ProviderMissingError } from "../errors";

// =============================================================================
// Context
// =============================================================================

const StoreContext = createContext<StoreContainer | null>(null);

/**
 * Provider component for store container.
 */
export interface StoreProviderProps {
  container?: StoreContainer;
  children: ReactNode;
}

export const StoreProvider: FC<StoreProviderProps> = memo(
  ({ container: value, children }) => {
    const valueOrDefault = useMemo(() => value ?? container(), [value]);
    return createElement(
      StoreContext.Provider,
      { value: valueOrDefault },
      children
    );
  }
);

/**
 * Hook to get the current store container.
 */
export function useContainer(): StoreContainer {
  const ctx = useContext(StoreContext);

  if (!ctx) {
    throw new ProviderMissingError("useContainer", "StoreProvider");
  }
  return ctx;
}
