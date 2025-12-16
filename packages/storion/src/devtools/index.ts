/**
 * Storion Devtools
 *
 * @example
 * ```ts
 * import { container } from "storion";
 * import { devtoolsMiddleware } from "storion/devtools";
 *
 * const app = container({
 *   middleware: [devtoolsMiddleware()],
 * });
 * ```
 */

export { devtoolsMiddleware, getDevtoolsController } from "./middleware";
export type {
  DevtoolsController,
  DevtoolsStoreEntry,
  DevtoolsMiddlewareOptions,
  StateSnapshot,
  DevtoolsEvent,
  DevtoolsEventType,
} from "./types";

