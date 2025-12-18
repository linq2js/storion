/**
 * Invitations IndexedDB Service
 *
 * Handles invitation CRUD operations.
 */

import type { Resolver } from "storion";
import type { RoomInvitation } from "../../types";
import { indexedDBCoreService } from "./core";

export function indexedDBInvitationsService(resolver: Resolver) {
  const core = resolver.get(indexedDBCoreService);

  const service = {
    async save(invitation: RoomInvitation) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.invitations, "readwrite");
      const store = tx.objectStore(core.stores.invitations);
      await core.promisifyRequest(store.put(invitation));
    },

    async get(id: string): Promise<RoomInvitation | undefined> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.invitations, "readonly");
      const store = tx.objectStore(core.stores.invitations);
      return core.promisifyRequest(store.get(id));
    },

    async getForUser(userId: string): Promise<RoomInvitation[]> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.invitations, "readonly");
      const store = tx.objectStore(core.stores.invitations);
      const index = store.index("inviteeId");
      const invitations: RoomInvitation[] = await core.promisifyRequest(
        index.getAll(userId)
      );
      return invitations.filter((inv) => inv.status === "pending");
    },

    async updateStatus(id: string, status: RoomInvitation["status"]) {
      const invitation = await service.get(id);
      if (invitation) {
        invitation.status = status;
        await service.save(invitation);
      }
    },

    async delete(id: string) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.invitations, "readwrite");
      const store = tx.objectStore(core.stores.invitations);
      await core.promisifyRequest(store.delete(id));
    },
  };

  return service;
}

