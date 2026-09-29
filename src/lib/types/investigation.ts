export type ClientIpKind = 'usable' | 'sdr' | 'private';

export type InvestigateEvent = {
  steamId: string;
  name: string | null;
  action: string;
  at: string;
  ip: string | null;
  ipKind: ClientIpKind | null;
  serverIp: string;
  serverName: string | null;
  region: string;
};

export type DistinctIp = {
  ip: string;
  kind: ClientIpKind;
};

export type AltCandidate = {
  steamId: string;
  steam64: string | null;
  avatar: string | null;
  score: number;
  label: 'Likely' | 'Possible' | 'Unlikely';
  sharedIps: string[];
  knownNames: string[];
  evidence: { ipOverlapScore: number; nameSimilarityScore: number };
  lastSeen: string | null;
};

export type AltLinkView = {
  steamId: string;
  steam64: string | null;
  avatar: string | null;
  mainSteamId: string | null;
  mainSteam64: string | null;
  linkedAt: string | null;
  linkedBy: string | null;
  lastSeen: string | null;
  region: string;
};

export type SteamInvestigation = {
  kind: 'steam';
  steamId: string;
  steam64: string | null;
  avatar: string | null;
  permName: string | null;
  knownNames: string[];
  distinctIps: DistinctIp[];
  usableIpCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  eventCount: number;
  sessionCount: number;
  totalSeconds: number;
  events: InvestigateEvent[];
  candidates: AltCandidate[];
  linkedAlts: AltLinkView[];
  linkedMain: AltLinkView | null;
  noUsableIps: boolean;
};

export type IpAccount = {
  steamId: string;
  steam64: string | null;
  avatar: string | null;
  name: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  eventCount: number;
};

export type IpInvestigation = {
  kind: 'ip';
  ip: string;
  ipKind: 'usable';
  accounts: IpAccount[];
  events: InvestigateEvent[];
};

export type InvestigateResult =
  | { kind: 'invalid' }
  | { kind: 'blocked-ip'; ip: string; reason: 'sdr' | 'private' }
  | { kind: 'not-found'; steamId: string; steam64: string | null }
  | { kind: 'error'; message: string }
  | SteamInvestigation
  | IpInvestigation;
