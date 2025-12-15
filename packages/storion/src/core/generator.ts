/**
 * ID generators for specs and store instances.
 */

// =============================================================================
// Spec Name Generator
// =============================================================================

let specIdCounter = 0;

/**
 * Generates a unique spec name.
 * Pattern: `spec-${autoIncrementId}`
 */
export function generateSpecName(): string {
  return `spec-${++specIdCounter}`;
}

// =============================================================================
// Store Instance ID Generator
// =============================================================================

let instanceIdCounter = 0;

/**
 * Generates a unique store instance ID.
 * Pattern: `${specName}:${autoIncrementId}`
 */
export function generateStoreId(specName: string): string {
  return `${specName}:${++instanceIdCounter}`;
}

// =============================================================================
// Reset (for testing)
// =============================================================================

/**
 * Reset all counters. Only use in tests.
 * @internal
 */
export function resetGenerators(): void {
  specIdCounter = 0;
  instanceIdCounter = 0;
}

