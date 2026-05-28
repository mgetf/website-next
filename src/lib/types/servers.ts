export type ServerStatus = 'running' | 'stopped' | 'restarting' | 'missing' | 'unknown';

export interface PublicGameServer {
  regionSlug: string;
  regionName: string;
  regionFlag?: string;
  hostSlug: string;
  slot: number;
  host: string;
  port: number;
  connect: string;
  sdrConnect?: string;
  displayName: string;
  map: string;
  label: string;
  elo: boolean;
  maxPlayers: number;
  playerCount: number;
  status: ServerStatus;
  uptime: string;
}

export interface PublicServersResponse {
  servers: PublicGameServer[];
  count: number;
  generatedAt: string;
}

export interface ServersPageData {
  servers: PublicGameServer[];
  count: number;
  generatedAt: string;
  error: string | null;
}
