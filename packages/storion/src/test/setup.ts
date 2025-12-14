/**
 * Test setup file for Vitest.
 */

import { expect, beforeEach, afterEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest expect with jest-dom matchers
expect.extend(matchers);

// Clear all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

