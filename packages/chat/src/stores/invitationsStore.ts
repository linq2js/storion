/**
 * Invitations Store
 *
 * Manages room invitations including:
 * - Loading pending invitations for the current user
 * - Sending invitations to other users
 * - Accepting/declining invitations
 *
 * Dependencies:
 * - authStore: To get current user for invitation operations
 * - roomsStore: To refresh rooms after accepting an invitation
 */

import { store, type ActionsBase } from "storion";
import { async, type AsyncState } from "storion/async";
import type { RoomInvitation } from "../types";
import { generateId } from "../types";
import {
  indexedDBInvitationsService,
  indexedDBRoomsService,
} from "../services/indexedDB";
import { crossTabSyncService } from "../services/crossTabSync";
import { authStore } from "./authStore";
import { roomsStore } from "./roomsStore";

// ============================================================================
// State Interface
// ============================================================================

export interface InvitationsState {
  /** List of pending invitations for the current user */
  invitations: AsyncState<RoomInvitation[], "stale">;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface InvitationsActions extends ActionsBase {
  /** Load pending invitations for the current user from IndexedDB */
  loadInvitations: () => Promise<void>;

  /** Reset the store to initial state */
  reset: () => void;

  /** Send an invitation to a user to join a room */
  inviteUserToRoom: (userId: string, roomId: string) => Promise<void>;

  /** Accept a room invitation (adds user to room members) */
  acceptInvitation: (invitationId: string) => Promise<void>;

  /** Decline a room invitation */
  declineInvitation: (invitationId: string) => Promise<void>;
}

// ============================================================================
// Store Definition
// ============================================================================

export const invitationsStore = store<InvitationsState, InvitationsActions>({
  name: "invitations",

  // Initial state
  state: {
    invitations: async.stale<RoomInvitation[]>([]),
  },

  // Setup receives StoreContext for accessing other stores
  setup: (ctx) => {
    const { focus, get } = ctx;

    // Get service instances via factory (cached by container)
    const invitations = get(indexedDBInvitationsService);
    const roomsDb = get(indexedDBRoomsService);
    const sync = get(crossTabSyncService);

    // Get store references during setup phase (MUST be at top level)
    // State is reactive - reads current value when accessed later
    const [authState] = get(authStore);
    const [, roomsActions] = get(roomsStore);

    // Async action for loading invitations (use *Query for read operations)
    const invitationsQuery = async.action(focus("invitations"), async () => {
      // Access reactive state (NOT calling get() here)
      if (!authState.currentUser) return [];

      // Load pending invitations where user is the invitee
      return invitations.getForUser(authState.currentUser.id);
    });

    return {
      // ========================
      // Load Invitations Action
      // ========================
      loadInvitations: async () => {
        await invitationsQuery.dispatch();
      },

      // ========================
      // Reset Action
      // ========================
      reset: () => {
        invitationsQuery.reset();
      },

      // ========================
      // Invite User to Room Action
      // ========================
      inviteUserToRoom: async (userId: string, roomId: string) => {
        if (!authState.currentUser) return;

        // Create invitation object
        const invitation: RoomInvitation = {
          id: generateId(),
          roomId,
          inviterId: authState.currentUser.id, // Who sent the invite
          inviteeId: userId, // Who receives the invite
          createdAt: Date.now(),
          status: "pending",
        };

        // Persist to IndexedDB
        await invitations.save(invitation);

        // Broadcast to other tabs (so invitee sees it in real-time)
        sync.broadcast("INVITE_SENT", invitation);
      },

      // ========================
      // Accept Invitation Action
      // ========================
      acceptInvitation: async (invitationId: string) => {
        // Fetch the invitation
        const invitation = await invitations.get(invitationId);
        if (!invitation || !authState.currentUser) return;

        // Update invitation status
        await invitations.updateStatus(invitationId, "accepted");

        // Add user to room members
        await roomsDb.addMember(invitation.roomId, authState.currentUser.id);

        // Broadcast to other tabs
        sync.broadcast("INVITE_ACCEPTED", {
          invitationId,
          roomId: invitation.roomId,
          userId: authState.currentUser.id,
        });

        // Refresh both rooms and invitations lists
        await Promise.all([
          roomsActions.loadRooms(),
          invitationsQuery.dispatch(),
        ]);
      },

      // ========================
      // Decline Invitation Action
      // ========================
      declineInvitation: async (invitationId: string) => {
        // Update invitation status
        await invitations.updateStatus(invitationId, "declined");

        // Broadcast to other tabs
        sync.broadcast("INVITE_DECLINED", { invitationId });

        // Refresh invitations list
        await invitationsQuery.dispatch();
      },
    };
  },
});
