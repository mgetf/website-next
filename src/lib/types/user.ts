/**
 * Shared User Types
 * Can be safely imported by both client and server code
 */

export { UserRole, BanStatus } from './enums';
import type { UserRole, BanStatus } from './enums';

/**
 * Session user data (client-safe version)
 */
export interface SessionUser {
  steamId: string;
  steamUsername: string;
  steamAvatar: string;
  permissionLevel: UserRole;
  banStatus: BanStatus;
  sessionVersion?: number;
}
