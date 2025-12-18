/**
 * Rooms IndexedDB Service
 *
 * Handles room CRUD operations.
 */

import type { Resolver } from "storion";
import type { Room } from "../../types";
import { indexedDBCoreService } from "./core";

export function indexedDBRoomsService(resolver: Resolver) {
  const core = resolver.get(indexedDBCoreService);

  const service = {
    async save(room: Room) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.rooms, "readwrite");
      const store = tx.objectStore(core.stores.rooms);
      await core.promisifyRequest(store.put(room));
    },

    async get(id: string): Promise<Room | undefined> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.rooms, "readonly");
      const store = tx.objectStore(core.stores.rooms);
      return core.promisifyRequest(store.get(id));
    },

    async getAll(): Promise<Room[]> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.rooms, "readonly");
      const store = tx.objectStore(core.stores.rooms);
      return core.promisifyRequest(store.getAll());
    },

    async getForUser(userId: string) {
      const rooms = await service.getAll();
      return rooms.filter((room) => room.members.includes(userId));
    },

    async delete(id: string) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.rooms, "readwrite");
      const store = tx.objectStore(core.stores.rooms);
      await core.promisifyRequest(store.delete(id));
    },

    async addMember(roomId: string, userId: string) {
      const room = await service.get(roomId);
      if (room && !room.members.includes(userId)) {
        room.members.push(userId);
        await service.save(room);
      }
    },

    async removeMember(roomId: string, userId: string) {
      const room = await service.get(roomId);
      if (room) {
        room.members = room.members.filter((id) => id !== userId);
        await service.save(room);
      }
    },
  };

  return service;
}

