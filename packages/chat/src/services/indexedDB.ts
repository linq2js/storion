import type { User, Room, Message, RoomInvitation } from "../types";

const DB_NAME = "storion_chat";
const DB_VERSION = 1;

const STORES = {
  users: "users",
  rooms: "rooms",
  messages: "messages",
  invitations: "invitations",
} as const;

let dbInstance: IDBDatabase | null = null;

// Initialize the database
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Users store
      if (!db.objectStoreNames.contains(STORES.users)) {
        const userStore = db.createObjectStore(STORES.users, { keyPath: "id" });
        userStore.createIndex("nickname", "nickname", { unique: false });
        userStore.createIndex("lastActiveAt", "lastActiveAt", { unique: false });
      }

      // Rooms store
      if (!db.objectStoreNames.contains(STORES.rooms)) {
        const roomStore = db.createObjectStore(STORES.rooms, { keyPath: "id" });
        roomStore.createIndex("createdBy", "createdBy", { unique: false });
        roomStore.createIndex("isDirectMessage", "isDirectMessage", { unique: false });
        roomStore.createIndex("lastMessageAt", "lastMessageAt", { unique: false });
      }

      // Messages store
      if (!db.objectStoreNames.contains(STORES.messages)) {
        const messageStore = db.createObjectStore(STORES.messages, { keyPath: "id" });
        messageStore.createIndex("roomId", "roomId", { unique: false });
        messageStore.createIndex("senderId", "senderId", { unique: false });
        messageStore.createIndex("createdAt", "createdAt", { unique: false });
        messageStore.createIndex("roomId_createdAt", ["roomId", "createdAt"], { unique: false });
      }

      // Invitations store
      if (!db.objectStoreNames.contains(STORES.invitations)) {
        const invStore = db.createObjectStore(STORES.invitations, { keyPath: "id" });
        invStore.createIndex("inviteeId", "inviteeId", { unique: false });
        invStore.createIndex("status", "status", { unique: false });
      }
    };
  });
}

// Generic helpers
async function getDB(): Promise<IDBDatabase> {
  return dbInstance ?? initDB();
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============ USERS ============
export async function saveUser(user: User): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.users, "readwrite");
  const store = tx.objectStore(STORES.users);
  await promisifyRequest(store.put(user));
}

export async function getUser(id: string): Promise<User | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORES.users, "readonly");
  const store = tx.objectStore(STORES.users);
  return promisifyRequest(store.get(id));
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDB();
  const tx = db.transaction(STORES.users, "readonly");
  const store = tx.objectStore(STORES.users);
  return promisifyRequest(store.getAll());
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.users, "readwrite");
  const store = tx.objectStore(STORES.users);
  await promisifyRequest(store.delete(id));
}

export async function updateUserStatus(id: string, status: User["status"], lastActiveAt: number): Promise<void> {
  const user = await getUser(id);
  if (user) {
    user.status = status;
    user.lastActiveAt = lastActiveAt;
    await saveUser(user);
  }
}

// ============ ROOMS ============
export async function saveRoom(room: Room): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.rooms, "readwrite");
  const store = tx.objectStore(STORES.rooms);
  await promisifyRequest(store.put(room));
}

export async function getRoom(id: string): Promise<Room | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORES.rooms, "readonly");
  const store = tx.objectStore(STORES.rooms);
  return promisifyRequest(store.get(id));
}

export async function getAllRooms(): Promise<Room[]> {
  const db = await getDB();
  const tx = db.transaction(STORES.rooms, "readonly");
  const store = tx.objectStore(STORES.rooms);
  return promisifyRequest(store.getAll());
}

export async function getRoomsForUser(userId: string): Promise<Room[]> {
  const rooms = await getAllRooms();
  return rooms.filter((room) => room.members.includes(userId));
}

export async function deleteRoom(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.rooms, "readwrite");
  const store = tx.objectStore(STORES.rooms);
  await promisifyRequest(store.delete(id));
}

export async function addMemberToRoom(roomId: string, userId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (room && !room.members.includes(userId)) {
    room.members.push(userId);
    await saveRoom(room);
  }
}

export async function removeMemberFromRoom(roomId: string, userId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (room) {
    room.members = room.members.filter((id) => id !== userId);
    await saveRoom(room);
  }
}

// ============ MESSAGES ============
export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.messages, "readwrite");
  const store = tx.objectStore(STORES.messages);
  await promisifyRequest(store.put(message));

  // Update room's lastMessageAt
  const room = await getRoom(message.roomId);
  if (room) {
    room.lastMessageAt = message.createdAt;
    await saveRoom(room);
  }
}

export async function getMessage(id: string): Promise<Message | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORES.messages, "readonly");
  const store = tx.objectStore(STORES.messages);
  return promisifyRequest(store.get(id));
}

export async function getMessagesForRoom(roomId: string, limit = 100): Promise<Message[]> {
  const db = await getDB();
  const tx = db.transaction(STORES.messages, "readonly");
  const store = tx.objectStore(STORES.messages);
  const index = store.index("roomId");
  const messages: Message[] = await promisifyRequest(index.getAll(roomId));
  
  // Sort by createdAt descending, then take last N
  return messages
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.messages, "readwrite");
  const store = tx.objectStore(STORES.messages);
  await promisifyRequest(store.delete(id));
}

export async function deleteMessagesForRoom(roomId: string): Promise<void> {
  const messages = await getMessagesForRoom(roomId, Infinity);
  const db = await getDB();
  const tx = db.transaction(STORES.messages, "readwrite");
  const store = tx.objectStore(STORES.messages);
  
  for (const message of messages) {
    await promisifyRequest(store.delete(message.id));
  }
}

// ============ INVITATIONS ============
export async function saveInvitation(invitation: RoomInvitation): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.invitations, "readwrite");
  const store = tx.objectStore(STORES.invitations);
  await promisifyRequest(store.put(invitation));
}

export async function getInvitation(id: string): Promise<RoomInvitation | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORES.invitations, "readonly");
  const store = tx.objectStore(STORES.invitations);
  return promisifyRequest(store.get(id));
}

export async function getInvitationsForUser(userId: string): Promise<RoomInvitation[]> {
  const db = await getDB();
  const tx = db.transaction(STORES.invitations, "readonly");
  const store = tx.objectStore(STORES.invitations);
  const index = store.index("inviteeId");
  const invitations: RoomInvitation[] = await promisifyRequest(index.getAll(userId));
  return invitations.filter((inv) => inv.status === "pending");
}

export async function updateInvitationStatus(
  id: string,
  status: RoomInvitation["status"]
): Promise<void> {
  const invitation = await getInvitation(id);
  if (invitation) {
    invitation.status = status;
    await saveInvitation(invitation);
  }
}

export async function deleteInvitation(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.invitations, "readwrite");
  const store = tx.objectStore(STORES.invitations);
  await promisifyRequest(store.delete(id));
}

// ============ CLEAR ALL ============
export async function clearAllData(): Promise<void> {
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
}

