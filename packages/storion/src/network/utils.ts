/**
 * Network utility functions.
 */

/**
 * Check if an error is a network connectivity error.
 * Works across Chrome, Firefox, Safari, React Native, and Apollo Client.
 */
export function isNetworkError(error: unknown): boolean {
  // 1. Browser offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }

  // 2. Apollo Client: check networkError property
  //    ApolloError wraps network errors in error.networkError
  if (error instanceof Error && "networkError" in error) {
    const networkError = (error as any).networkError;
    if (networkError) {
      return isNetworkError(networkError);
    }
  }

  // 3. TypeError from fetch() - all browsers throw TypeError for network issues
  //    (but with different messages)
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    // Chrome: "failed to fetch"
    // Firefox: "networkerror when attempting to fetch resource"
    // Safari: "load failed"
    // Generic: "network"
    if (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("load failed")
    ) {
      return true;
    }
  }

  // 4. DOMException or AbortError (cross-platform)
  // DOMException may not extend Error in some environments (jsdom, older browsers),
  // so check both instanceof DOMException (if available) and error.name directly
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name: string }).name;
    if (
      name === "NetworkError" ||
      name === "TimeoutError" ||
      name === "AbortError"
    ) {
      return true;
    }
  }

  // 5. React Native / Node.js specific
  if (error instanceof Error) {
    const code = (error as any).code;
    if (
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ENETUNREACH"
    ) {
      return true;
    }
  }

  return false;
}
