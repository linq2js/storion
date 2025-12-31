/**
 * Tests for React context and provider.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { wrappers } from "./strictModeTest";
import { StoreProvider, useContainer } from "./context";
import { container } from "../core/container";

describe.each(wrappers)("context ($mode mode)", ({ render, renderHook }) => {
  describe("StoreProvider", () => {
    it("should provide container to children", () => {
      const stores = container();
      let capturedContainer: ReturnType<typeof container> | null = null;

      function TestComponent() {
        capturedContainer = useContainer();
        return <div>Test</div>;
      }

      render(
        <StoreProvider container={stores}>
          <TestComponent />
        </StoreProvider>
      );

      expect(capturedContainer).toBe(stores);
    });

    it("should render children", () => {
      const stores = container();

      const { getByText } = render(
        <StoreProvider container={stores}>
          <div>Hello World</div>
        </StoreProvider>
      );

      expect(getByText("Hello World")).toBeTruthy();
    });
  });

  describe("useContainer", () => {
    it("should return container from context", () => {
      const stores = container();

      const { result } = renderHook(() => useContainer(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <StoreProvider container={stores}>{children}</StoreProvider>
        ),
      });

      expect(result.current).toBe(stores);
    });

    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useContainer());
      }).toThrow("useContainer must be used within a StoreProvider");

      consoleSpy.mockRestore();
    });
  });
});
