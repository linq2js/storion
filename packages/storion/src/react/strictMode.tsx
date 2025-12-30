import {
  createContext,
  memo,
  PropsWithChildren,
  StrictMode as ReactStrictMode,
  useContext,
} from "react";

const context = createContext<boolean>(false);

/**
 * Custom StrictMode component that enables detection via useStrictMode().
 *
 * Use this instead of React.StrictMode to allow Storion to properly handle
 * double rendering and effect calling in strict mode.
 */
export const StrictMode = memo(({ children }: PropsWithChildren) => {
  return (
    <context.Provider value={true}>
      <ReactStrictMode>{children}</ReactStrictMode>
    </context.Provider>
  );
});

/**
 * Hook to detect if component is rendered inside StrictMode.
 *
 * @returns true if inside Storion's StrictMode, false otherwise
 */
export function useStrictMode() {
  return useContext(context);
}

// Re-export test utilities
export { wrappers } from "./strictModeTest";
