/**
 * React Context for Store Container
 */

import {
  createContext,
  useContext,
  createElement,
  type ReactNode,
  type FC,
} from "react";

import type { StoreContainer } from "../types";

// =============================================================================
// Context
// =============================================================================

const StoreContext = createContext<StoreContainer | null>(null);

/**
 * Provider component for store container.
 */
export interface StoreProviderProps {
  container: StoreContainer;
  children: ReactNode;
}

export const StoreProvider: FC<StoreProviderProps> = ({
  container: value,
  children,
}) => {
  return createElement(StoreContext.Provider, { value }, children);
};

/**
 * Hook to get the current store container.
 */
export function useContainer(): StoreContainer {
  const container = useContext(StoreContext);
  if (!container) {
    throw new Error("useContainer must be used within a StoreProvider");
  }
  return container;
}
