/**
 * Core IndexedDB Service
 *
 * Handles database connection and low-level operations.
 * Shared by all domain-specific services.
 */

const DEFAULT_DB_NAME = "storion_chat";
const DEFAULT_DB_VERSION = 1;

export const STORES = {
  users: "users",
  rooms: "rooms",
  messages: "messages",
  invitations: "invitations",
} as const;

/**
 * Core IndexedDB service factory.
 */
export function indexedDBCoreService() {
  let dbInstance: IDBDatabase | null = null;

  /** Open database connection */
  async function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DEFAULT_DB_NAME, DEFAULT_DB_VERSION);

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

  /** Promisify IDBRequest */
  function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    stores: STORES,

    async init() {
      await openDB();
    },

    async getDB() {
      return dbInstance ?? openDB();
    },

    promisifyRequest,

    async clearAll() {
      const db = await this.getDB();
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

