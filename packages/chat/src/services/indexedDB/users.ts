/**
 * Users IndexedDB Service
 *
 * Handles user CRUD operations.
 */

import type { Resolver } from "storion";
import type { User } from "../../types";
import { indexedDBCoreService } from "./core";

export function indexedDBUsersService(resolver: Resolver) {
  const core = resolver.get(indexedDBCoreService);

  const service = {
    async save(user: User) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.users, "readwrite");
      const store = tx.objectStore(core.stores.users);
      await core.promisifyRequest(store.put(user));
    },

    async get(id: string): Promise<User | undefined> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.users, "readonly");
      const store = tx.objectStore(core.stores.users);
      return core.promisifyRequest(store.get(id));
    },

    async getAll(): Promise<User[]> {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.users, "readonly");
      const store = tx.objectStore(core.stores.users);
      return core.promisifyRequest(store.getAll());
    },

    async delete(id: string) {
      const db = await core.getDB();
      const tx = db.transaction(core.stores.users, "readwrite");
      const store = tx.objectStore(core.stores.users);
      await core.promisifyRequest(store.delete(id));
    },

    async updateStatus(
      id: string,
      status: User["status"],
      lastActiveAt: number
    ) {
      const user = await service.get(id);
      if (user) {
        user.status = status;
        user.lastActiveAt = lastActiveAt;
        await service.save(user);
      }
    },
  };

  return service;
}

