/**
 * Shared User Types
 * Can be safely imported by both client and server code
 */

// Mirror of Prisma's UserRole enum for client-side use
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

// Mirror of Prisma's BanStatus enum for client-side use
export enum BanStatus {
  NONE = 'NONE',
  WARNING = 'WARNING',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

/**
 * Session user data (client-safe version)
 */
export interface SessionUser {
  steamId: string;
  steamUsername: string;
  steamAvatar: string;
  permissionLevel: UserRole;
  banStatus: BanStatus;
}
