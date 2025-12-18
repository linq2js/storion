/**
 * Messages IndexedDB Service
 *
 * Handles message CRUD operations.
 */

import type { Resolver } from "storion";
import type { Room, Message } from "../../types";
import { indexedDBCoreService } from "./core";

export function indexedDBMessagesService(resolver: Resolver) {
  const core = resolver.get(indexedDBCoreService);

  const service = {
    async save(message: Message) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.messages, "readwrite");
      const store = tx.objectStore(core.stores.messages);
      await core.promisifyRequest(store.put(message));

      // Update room's lastMessageAt
      const roomTx = db.transaction(core.stores.rooms, "readwrite");
      const roomStore = roomTx.objectStore(core.stores.rooms);
      const room = await core.promisifyRequest<Room | undefined>(
        roomStore.get(message.roomId)
      );
      if (room) {
        room.lastMessageAt = message.createdAt;
        await core.promisifyRequest(roomStore.put(room));
      }
    },

    async get(id: string): Promise<Message | undefined> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.messages, "readonly");
      const store = tx.objectStore(core.stores.messages);
      return core.promisifyRequest(store.get(id));
    },

    async getForRoom(roomId: string, limit = 100): Promise<Message[]> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.messages, "readonly");
      const store = tx.objectStore(core.stores.messages);
      const index = store.index("roomId");
      const messages: Message[] = await core.promisifyRequest(
        index.getAll(roomId)
      );

      // Sort by createdAt ascending, then take last N
      return messages.sort((a, b) => a.createdAt - b.createdAt).slice(-limit);
    },

    async delete(id: string) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.messages, "readwrite");
      const store = tx.objectStore(core.stores.messages);
      await core.promisifyRequest(store.delete(id));
    },

    async deleteForRoom(roomId: string) {
      const messages = await service.getForRoom(roomId, Infinity);
      const db = await core.getDB();
      const tx = db.transaction(core.stores.messages, "readwrite");
      const store = tx.objectStore(core.stores.messages);

      for (const message of messages) {
        await core.promisifyRequest(store.delete(message.id));
      }
    },
  };

  return service;
}

