/**
 * Devtools Utility Functions
 *
 * Shared utility functions for the devtools panel.
 */

/**
 * Format a timestamp to time string (HH:MM:SS)
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Format a timestamp to date+time string
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Format a value for display with type information
 */
export function formatValue(value: unknown): { text: string; type: string } {
  if (value === null) return { text: "null", type: "null" };
  if (value === undefined) return { text: "undefined", type: "null" };
  if (typeof value === "string") return { text: `"${value}"`, type: "string" };
  if (typeof value === "number") return { text: String(value), type: "number" };
  if (typeof value === "boolean")
    return { text: String(value), type: "boolean" };
  if (Array.isArray(value))
    return { text: `Array(${value.length})`, type: "object" };
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return {
      text: `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}}`,
      type: "object",
    };
  }
  return { text: String(value), type: "unknown" };
}

