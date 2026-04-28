export type Gamemode = 'mge' | 'bball' | 'koth' | 'ammomod' | 'midair' | 'endif' | 'ultiduo';
export type LogFormat = '1v1' | '2v2';
export type Team = 'Red' | 'Blue';
export type ChatScope = 'all' | 'team';

export interface ParsedMatch {
  meta: MatchMeta;
  players: PlayerRecord[];
  events: MatchEvent[];
  chat: ChatMessage[];
}

export interface MatchMeta {
  matchId: string;
  map: string;
  arena: string;
  gamemode: Gamemode;
  fragLimit: number;
  format: LogFormat;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  aborted: boolean;
  abortReason: 'player_disconnect' | 'map_change' | 'plugin_unload' | null;
}

export interface PlayerRecord {
  steamId: string;
  name: string;
  team: Team;
  startClass: string;
  won: boolean;
  score: number;
  elo: EloRecord | null;
  stats: PlayerStats;
}

export interface EloRecord {
  before: number;
  after: number;
  delta: number;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  damageDone: number;
  damageReceived: number;
  dpm: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number | null;
  airshots: number;
  headshotKills: number;
  weaponBreakdown: Record<string, WeaponStats>;
  medicStats: MedicStats | null;
}

export interface WeaponStats {
  kills: number;
  damage: number;
  shotsFired: number;
  shotsHit: number;
}

export interface MedicStats {
  chargesDeployed: number;
  chargesDropped: number;
  avgChargeDuration: number | null;
  medigun: string | null;
}

export type MatchEvent = KillEvent | DamageEvent | AirshotEvent;

export interface KillEvent {
  type: 'kill';
  timestamp: string;
  attackerSteamId: string;
  victimSteamId: string;
  weapon: string;
  headshot: boolean;
  airshot: boolean;
}

export interface DamageEvent {
  type: 'damage';
  timestamp: string;
  attackerSteamId: string;
  victimSteamId: string;
  damage: number;
  realDamage: number;
  weapon: string;
  headshot: boolean;
  airshot: boolean;
}

export interface AirshotEvent {
  type: 'airshot';
  timestamp: string;
  attackerSteamId: string;
  victimSteamId: string;
  height: number;
}

export interface ChatMessage {
  timestamp: string;
  steamId: string;
  scope: ChatScope;
  message: string;
}

export interface MatchLogSummary {
  id: number;
  mgeMatchId: string;
  hostname: string | null;
  map: string;
  arena: string | null;
  gamemode: string;
  format: string;
  aborted: boolean;
  durationSec: number | null;
  startedAt: string | null;
  endedAt: string | null;
  uploadedAt: string;
}

export interface MatchLogDetail extends MatchLogSummary {
  parsedData: ParsedMatch;
  rawLogKey: string;
}
