/**
 * Route Store
 *
 * Manages the current route/view of the application.
 * Uses discriminated union pattern for type-safe routing.
 *
 * Routes:
 * - welcome: Default view when no room is selected
 * - room: Viewing a specific room/conversation
 * - dashboard: Admin dashboard (admin only)
 */

import { store, type ActionsBase } from "storion";
import { type Route, welcomeRoute, roomRoute, dashboardRoute } from "../types";

// ============================================================================
// State Interface
// ============================================================================

export interface RouteState {
  /** Current active route */
  route: Route;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface RouteActions extends ActionsBase {
  /** Navigate to welcome screen */
  goToWelcome: () => void;

  /** Navigate to a specific room */
  goToRoom: (roomId: string) => void;

  /** Navigate to admin dashboard */
  goToDashboard: () => void;

  /** Generic set route action */
  setRoute: (route: Route) => void;

  /** Reset to welcome route */
  reset: () => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const routeStore = store<RouteState, RouteActions>({
  name: "route",

  state: {
    route: welcomeRoute(),
  },

  setup: (ctx) => {
    const { update } = ctx;

    return {
      goToWelcome: update.action((draft: RouteState) => {
        draft.route = welcomeRoute();
      }),

      goToRoom: update.action((draft: RouteState, roomId: string) => {
        draft.route = roomRoute(roomId);
      }),

      goToDashboard: update.action((draft: RouteState) => {
        draft.route = dashboardRoute();
      }),

      setRoute: update.action((draft: RouteState, route: Route) => {
        draft.route = route;
      }),

      reset: update.action((draft: RouteState) => {
        draft.route = welcomeRoute();
      }),
    };
  },
});

// ============================================================================
// Helper Selectors
// ============================================================================

/** Get the active room ID if viewing a room, otherwise null */
export function getActiveRoomId(route: Route): string | null {
  return route.type === "room" ? route.payload.id : null;
}

/** Check if currently viewing dashboard */
export function isDashboard(route: Route): boolean {
  return route.type === "dashboard";
}

/** Check if currently viewing a room */
export function isRoom(route: Route): boolean {
  return route.type === "room";
}

