// User types
export interface User {
  id: string;
  nickname: string;
  fullName: string;
  avatar: string;
  createdAt: number;
  lastActiveAt: number;
  status: UserStatus;
}

export type UserStatus = "online" | "away" | "offline";

export interface CurrentUser extends User {
  tabId: string;
}

// Room types
export interface Room {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  members: string[]; // user IDs
  isDirectMessage: boolean;
  lastMessageAt: number;
}

// Message types
export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: number;
  editedAt?: number;
  replyTo?: string; // message ID
}

// Typing indicator
export interface TypingIndicator {
  roomId: string;
  userId: string;
  timestamp: number;
}

// Cross-tab sync events
export type SyncEventType =
  | "USER_LOGGED_IN"
  | "USER_LOGGED_OUT"
  | "USER_UPDATED"
  | "USER_STATUS_CHANGED"
  | "ROOM_CREATED"
  | "ROOM_UPDATED"
  | "ROOM_DELETED"
  | "MESSAGE_SENT"
  | "MESSAGE_EDITED"
  | "MESSAGE_DELETED"
  | "TYPING_START"
  | "TYPING_STOP"
  | "INVITE_SENT"
  | "INVITE_ACCEPTED"
  | "INVITE_DECLINED";

export interface SyncEvent<T = unknown> {
  type: SyncEventType;
  payload: T;
  timestamp: number;
  tabId: string;
}

// Room invitation
export interface RoomInvitation {
  id: string;
  roomId: string;
  inviterId: string;
  inviteeId: string;
  createdAt: number;
  status: "pending" | "accepted" | "declined";
}

// Helper to generate avatar URL
export function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Helper to get tab ID
export function getTabId(): string {
  let tabId = sessionStorage.getItem("chat_tab_id");
  if (!tabId) {
    tabId = generateId();
    sessionStorage.setItem("chat_tab_id", tabId);
  }
  return tabId;
}

// Direct message room ID helper
export function getDMRoomId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

