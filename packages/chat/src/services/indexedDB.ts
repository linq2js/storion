/**
 * IndexedDB Service Factory
 *
 * Provides persistent storage for chat data (users, rooms, messages, invitations).
 * Uses factory pattern for testability - can inject mock implementations.
 *
 * @example
 * // Production usage
 * const db = createIndexedDBService();
 * await db.init();
 * await db.users.save(user);
 *
 * // Test usage
 * const mockDb = createIndexedDBService({ storage: mockStorage });
 */

import type { User, Room, Message, RoomInvitation } from "../types";

// =============================================================================
// Types
// =============================================================================

/** IndexedDB service interface */
export interface IndexedDBService {
  /** Initialize the database connection */
  init(): Promise<void>;

  /** User operations */
  users: {
    save(user: User): Promise<void>;
    get(id: string): Promise<User | undefined>;
    getAll(): Promise<User[]>;
    delete(id: string): Promise<void>;
    updateStatus(
      id: string,
      status: User["status"],
      lastActiveAt: number
    ): Promise<void>;
  };

  /** Room operations */
  rooms: {
    save(room: Room): Promise<void>;
    get(id: string): Promise<Room | undefined>;
    getAll(): Promise<Room[]>;
    getForUser(userId: string): Promise<Room[]>;
    delete(id: string): Promise<void>;
    addMember(roomId: string, userId: string): Promise<void>;
    removeMember(roomId: string, userId: string): Promise<void>;
  };

  /** Message operations */
  messages: {
    save(message: Message): Promise<void>;
    get(id: string): Promise<Message | undefined>;
    getForRoom(roomId: string, limit?: number): Promise<Message[]>;
    delete(id: string): Promise<void>;
    deleteForRoom(roomId: string): Promise<void>;
  };

  /** Invitation operations */
  invitations: {
    save(invitation: RoomInvitation): Promise<void>;
    get(id: string): Promise<RoomInvitation | undefined>;
    getForUser(userId: string): Promise<RoomInvitation[]>;
    updateStatus(id: string, status: RoomInvitation["status"]): Promise<void>;
    delete(id: string): Promise<void>;
  };

  /** Clear all data (for testing/reset) */
  clearAll(): Promise<void>;
}

/** Options for creating the IndexedDB service */
export interface IndexedDBServiceOptions {
  /** Database name (default: "storion_chat") */
  dbName?: string;
  /** Database version (default: 1) */
  dbVersion?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DB_NAME = "storion_chat";
const DEFAULT_DB_VERSION = 1;

const STORES = {
  users: "users",
  rooms: "rooms",
  messages: "messages",
  invitations: "invitations",
} as const;

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an IndexedDB service instance.
 *
 * @param options - Configuration options
 * @returns IndexedDB service with all CRUD operations
 */
export function createIndexedDBService(
  options: IndexedDBServiceOptions = {}
): IndexedDBService {
  const { dbName = DEFAULT_DB_NAME, dbVersion = DEFAULT_DB_VERSION } = options;

  // Private state
  let dbInstance: IDBDatabase | null = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Open database connection */
  async function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Users store
        if (!db.objectStoreNames.contains(STORES.users)) {
          const userStore = db.createObjectStore(STORES.users, {
            keyPath: "id",
          });
          userStore.createIndex("nickname", "nickname", { unique: false });
          userStore.createIndex("lastActiveAt", "lastActiveAt", {
            unique: false,
          });
        }

        // Rooms store
        if (!db.objectStoreNames.contains(STORES.rooms)) {
          const roomStore = db.createObjectStore(STORES.rooms, {
            keyPath: "id",
          });
          roomStore.createIndex("createdBy", "createdBy", { unique: false });
          roomStore.createIndex("isDirectMessage", "isDirectMessage", {
            unique: false,
          });
          roomStore.createIndex("lastMessageAt", "lastMessageAt", {
            unique: false,
          });
        }

        // Messages store
        if (!db.objectStoreNames.contains(STORES.messages)) {
          const messageStore = db.createObjectStore(STORES.messages, {
            keyPath: "id",
          });
          messageStore.createIndex("roomId", "roomId", { unique: false });
          messageStore.createIndex("senderId", "senderId", { unique: false });
          messageStore.createIndex("createdAt", "createdAt", { unique: false });
          messageStore.createIndex(
            "roomId_createdAt",
            ["roomId", "createdAt"],
            { unique: false }
          );
        }

        // Invitations store
        if (!db.objectStoreNames.contains(STORES.invitations)) {
          const invStore = db.createObjectStore(STORES.invitations, {
            keyPath: "id",
          });
          invStore.createIndex("inviteeId", "inviteeId", { unique: false });
          invStore.createIndex("status", "status", { unique: false });
        }
      };
    });
  }

  /** Get database connection (initializes if needed) */
  async function getDB(): Promise<IDBDatabase> {
    return dbInstance ?? openDB();
  }

  /** Promisify IDBRequest */
  function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    // Initialize database
    async init() {
      await openDB();
    },

    // =========================================================================
    // Users
    // =========================================================================
    users: {
      async save(user: User) {
        const db = await getDB();
        const tx = db.transaction(STORES.users, "readwrite");
        const store = tx.objectStore(STORES.users);
        await promisifyRequest(store.put(user));
      },

      async get(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.users, "readonly");
        const store = tx.objectStore(STORES.users);
        return promisifyRequest(store.get(id));
      },

      async getAll() {
        const db = await getDB();
        const tx = db.transaction(STORES.users, "readonly");
        const store = tx.objectStore(STORES.users);
        return promisifyRequest(store.getAll());
      },

      async delete(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.users, "readwrite");
        const store = tx.objectStore(STORES.users);
        await promisifyRequest(store.delete(id));
      },

      async updateStatus(
        id: string,
        status: User["status"],
        lastActiveAt: number
      ) {
        const user = await this.get(id);
        if (user) {
          user.status = status;
          user.lastActiveAt = lastActiveAt;
          await this.save(user);
        }
      },
    },

    // =========================================================================
    // Rooms
    // =========================================================================
    rooms: {
      async save(room: Room) {
        const db = await getDB();
        const tx = db.transaction(STORES.rooms, "readwrite");
        const store = tx.objectStore(STORES.rooms);
        await promisifyRequest(store.put(room));
      },

      async get(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.rooms, "readonly");
        const store = tx.objectStore(STORES.rooms);
        return promisifyRequest(store.get(id));
      },

      async getAll() {
        const db = await getDB();
        const tx = db.transaction(STORES.rooms, "readonly");
        const store = tx.objectStore(STORES.rooms);
        return promisifyRequest(store.getAll());
      },

      async getForUser(userId: string) {
        const rooms = await this.getAll();
        return rooms.filter((room) => room.members.includes(userId));
      },

      async delete(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.rooms, "readwrite");
        const store = tx.objectStore(STORES.rooms);
        await promisifyRequest(store.delete(id));
      },

      async addMember(roomId: string, userId: string) {
        const room = await this.get(roomId);
        if (room && !room.members.includes(userId)) {
          room.members.push(userId);
          await this.save(room);
        }
      },

      async removeMember(roomId: string, userId: string) {
        const room = await this.get(roomId);
        if (room) {
          room.members = room.members.filter((id) => id !== userId);
          await this.save(room);
        }
      },
    },

    // =========================================================================
    // Messages
    // =========================================================================
    messages: {
      async save(message: Message) {
        const db = await getDB();
        const tx = db.transaction(STORES.messages, "readwrite");
        const store = tx.objectStore(STORES.messages);
        await promisifyRequest(store.put(message));

        // Update room's lastMessageAt
        const roomDb = await getDB();
        const roomTx = roomDb.transaction(STORES.rooms, "readwrite");
        const roomStore = roomTx.objectStore(STORES.rooms);
        const room = await promisifyRequest<Room | undefined>(
          roomStore.get(message.roomId)
        );
        if (room) {
          room.lastMessageAt = message.createdAt;
          await promisifyRequest(roomStore.put(room));
        }
      },

      async get(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.messages, "readonly");
        const store = tx.objectStore(STORES.messages);
        return promisifyRequest(store.get(id));
      },

      async getForRoom(roomId: string, limit = 100) {
        const db = await getDB();
        const tx = db.transaction(STORES.messages, "readonly");
        const store = tx.objectStore(STORES.messages);
        const index = store.index("roomId");
        const messages: Message[] = await promisifyRequest(
          index.getAll(roomId)
        );

        // Sort by createdAt ascending, then take last N
        return messages.sort((a, b) => a.createdAt - b.createdAt).slice(-limit);
      },

      async delete(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.messages, "readwrite");
        const store = tx.objectStore(STORES.messages);
        await promisifyRequest(store.delete(id));
      },

      async deleteForRoom(roomId: string) {
        const messages = await this.getForRoom(roomId, Infinity);
        const db = await getDB();
        const tx = db.transaction(STORES.messages, "readwrite");
        const store = tx.objectStore(STORES.messages);

        for (const message of messages) {
          await promisifyRequest(store.delete(message.id));
        }
      },
    },

    // =========================================================================
    // Invitations
    // =========================================================================
    invitations: {
      async save(invitation: RoomInvitation) {
        const db = await getDB();
        const tx = db.transaction(STORES.invitations, "readwrite");
        const store = tx.objectStore(STORES.invitations);
        await promisifyRequest(store.put(invitation));
      },

      async get(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.invitations, "readonly");
        const store = tx.objectStore(STORES.invitations);
        return promisifyRequest(store.get(id));
      },

      async getForUser(userId: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.invitations, "readonly");
        const store = tx.objectStore(STORES.invitations);
        const index = store.index("inviteeId");
        const invitations: RoomInvitation[] = await promisifyRequest(
          index.getAll(userId)
        );
        return invitations.filter((inv) => inv.status === "pending");
      },

      async updateStatus(id: string, status: RoomInvitation["status"]) {
        const invitation = await this.get(id);
        if (invitation) {
          invitation.status = status;
          await this.save(invitation);
        }
      },

      async delete(id: string) {
        const db = await getDB();
        const tx = db.transaction(STORES.invitations, "readwrite");
        const store = tx.objectStore(STORES.invitations);
        await promisifyRequest(store.delete(id));
      },
    },

    // =========================================================================
    // Clear All
    // =========================================================================
    async clearAll() {
      const db = await getDB();
      const tx = db.transaction(
        [STORES.users, STORES.rooms, STORES.messages, STORES.invitations],
        "readwrite"
      );

      await Promise.all([
        promisifyRequest(tx.objectStore(STORES.users).clear()),
        promisifyRequest(tx.objectStore(STORES.rooms).clear()),
        promisifyRequest(tx.objectStore(STORES.messages).clear()),
        promisifyRequest(tx.objectStore(STORES.invitations).clear()),
      ]);
    },
  };
}

// =============================================================================
// Service Factory (for use with StoreContext.get())
// =============================================================================

/**
 * IndexedDB service factory.
 *
 * Use with StoreContext.get() to get the singleton instance:
 * ```ts
 * setup: (ctx) => {
 *   const db = ctx.get(indexedDBService);
 *   // db.users.save(user), db.rooms.getAll(), etc.
 * }
 * ```
 */
export function indexedDBService(_resolver?: unknown): IndexedDBService {
  return createIndexedDBService();
}
