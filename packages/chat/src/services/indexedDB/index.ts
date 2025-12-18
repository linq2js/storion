/**
 * IndexedDB Services
 *
 * Modular IndexedDB services for chat data persistence.
 * Each domain service uses the core service via resolver pattern.
 *
 * @example
 * ```ts
 * setup: (ctx) => {
 *   const users = ctx.get(indexedDBUsersService);
 *   const rooms = ctx.get(indexedDBRoomsService);
 *   await users.save(user);
 *   await rooms.getForUser(userId);
 * }
 * ```
 */

export { indexedDBCoreService } from "./core";
export { indexedDBUsersService } from "./users";
export { indexedDBRoomsService } from "./rooms";
export { indexedDBMessagesService } from "./messages";
export { indexedDBInvitationsService } from "./invitations";
