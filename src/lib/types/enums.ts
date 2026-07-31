/**
 * Shared domain enums — formerly Prisma-generated. Safe for client + server.
 * Values must stay aligned with historical Prisma schema / DB string enums.
 */

export enum UserRole {
  GUEST = 'GUEST',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export enum BanStatus {
  NONE = 'NONE',
  WARNING = 'WARNING',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export enum TeamStatus {
  DEAD = 'DEAD',
  UNREADY = 'UNREADY',
  PENDING = 'PENDING',
  READY = 'READY',
  PLACEMENT = 'PLACEMENT',
}

export enum MatchStatus {
  UNPLAYED = 'UNPLAYED',
  PLAYED = 'PLAYED',
  DISPUTE = 'DISPUTE',
}

export enum DemoStatus {
  CLEAR = 'CLEAR',
  REVIEW = 'REVIEW',
  ACTION = 'ACTION',
}

export enum NotificationType {
  MATCH_COMM = 'MATCH_COMM',
  PENDING_PLAYER = 'PENDING_PLAYER',
  MATCH_CREATED = 'MATCH_CREATED',
  PLAYER_INVITE = 'PLAYER_INVITE',
  ADMIN_ACTION = 'ADMIN_ACTION',
  BYE_WEEK = 'BYE_WEEK',
}

export enum MapBanActionType {
  BAN = 'BAN',
  PICK = 'PICK',
}
