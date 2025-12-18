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

import { store, type ActionsBase, type StoreContext } from "storion";
import { async, type AsyncState } from "storion/async";
import type { RoomInvitation } from "../types";
import { generateId } from "../types";
import * as db from "../services/indexedDB";
import { broadcastEvent } from "../services/crossTabSync";
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
  setup: ({ focus }, ctx: StoreContext) => {
    // Async action for loading invitations
    const invitationsAsync = async(focus("invitations"), async () => {
      // Get current user from authStore
      const [authState] = ctx.get(authStore);
      if (!authState.currentUser) return [];

      // Load pending invitations where user is the invitee
      return db.getInvitationsForUser(authState.currentUser.id);
    });

    return {
      // ========================
      // Load Invitations Action
      // ========================
      loadInvitations: async () => {
        await invitationsAsync.dispatch();
      },

      // ========================
      // Reset Action
      // ========================
      reset: () => {
        invitationsAsync.reset();
      },

      // ========================
      // Invite User to Room Action
      // ========================
      inviteUserToRoom: async (userId: string, roomId: string) => {
        const [authState] = ctx.get(authStore);
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
        await db.saveInvitation(invitation);

        // Broadcast to other tabs (so invitee sees it in real-time)
        broadcastEvent("INVITE_SENT", invitation);
      },

      // ========================
      // Accept Invitation Action
      // ========================
      acceptInvitation: async (invitationId: string) => {
        const [authState] = ctx.get(authStore);
        // Get roomsActions to refresh rooms list
        const [, roomsActions] = ctx.get(roomsStore);

        // Fetch the invitation
        const invitation = await db.getInvitation(invitationId);
        if (!invitation || !authState.currentUser) return;

        // Update invitation status
        await db.updateInvitationStatus(invitationId, "accepted");

        // Add user to room members
        await db.addMemberToRoom(invitation.roomId, authState.currentUser.id);

        // Broadcast to other tabs
        broadcastEvent("INVITE_ACCEPTED", {
          invitationId,
          roomId: invitation.roomId,
          userId: authState.currentUser.id,
        });

        // Refresh both rooms and invitations lists
        await Promise.all([
          roomsActions.loadRooms(),
          invitationsAsync.dispatch(),
        ]);
      },

      // ========================
      // Decline Invitation Action
      // ========================
      declineInvitation: async (invitationId: string) => {
        // Update invitation status
        await db.updateInvitationStatus(invitationId, "declined");

        // Broadcast to other tabs
        broadcastEvent("INVITE_DECLINED", { invitationId });

        // Refresh invitations list
        await invitationsAsync.dispatch();
      },
    };
  },
});
