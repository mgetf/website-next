import {
  investigatePlayer,
  isPlatformInvestigateConfigured,
} from '$lib/server/clients/mgePlatform';
import type {
  AltCandidate,
  AltLinkView,
  ClientIpKind,
  DistinctIp,
  InvestigateEvent,
  InvestigateResult,
  IpAccount,
  IpInvestigation,
  SteamInvestigation,
} from '$lib/types/investigation';

export function isPlayerInvestigationConfigured(): boolean {
  return isPlatformInvestigateConfigured();
}

export async function getPlayerInvestigation(query: string): Promise<InvestigateResult> {
  const q = query.trim();
  if (!q) return { kind: 'invalid' };
  return mapInvestigateResult(await investigatePlayer(q));
}

export function mapInvestigateResult(raw: InvestigateResult): InvestigateResult {
  switch (raw.kind) {
    case 'invalid':
      return { kind: 'invalid' };
    case 'error':
      return { kind: 'error', message: raw.message };
    case 'blocked-ip':
      return { kind: 'blocked-ip', ip: raw.ip, reason: raw.reason };
    case 'not-found':
      return { kind: 'not-found', steamId: raw.steamId, steam64: raw.steam64 };
    case 'ip':
      return mapIpInvestigation(raw);
    case 'steam':
      return mapSteamInvestigation(raw);
  }
}

function iso(value: string | null): string | null {
  return value ?? null;
}

function mapEvent(event: InvestigateEvent): InvestigateEvent {
  return {
    steamId: event.steamId,
    name: event.name,
    action: event.action,
    at: iso(event.at) ?? event.at,
    ip: event.ip,
    ipKind: event.ipKind,
    serverIp: event.serverIp,
    serverName: event.serverName,
    region: event.region,
  };
}

function mapDistinctIp(item: DistinctIp): DistinctIp {
  const kind: ClientIpKind = item.kind;
  return { ip: item.ip, kind };
}

function mapLink(link: AltLinkView): AltLinkView {
  return {
    steamId: link.steamId,
    steam64: link.steam64,
    mainSteamId: link.mainSteamId,
    mainSteam64: link.mainSteam64,
    linkedAt: iso(link.linkedAt),
    linkedBy: link.linkedBy,
    lastSeen: iso(link.lastSeen),
    region: link.region,
  };
}

function mapCandidate(candidate: AltCandidate): AltCandidate {
  return {
    steamId: candidate.steamId,
    steam64: candidate.steam64,
    score: candidate.score,
    label: candidate.label,
    sharedIps: [...candidate.sharedIps],
    knownNames: [...candidate.knownNames],
    evidence: {
      ipOverlapScore: candidate.evidence.ipOverlapScore,
      nameSimilarityScore: candidate.evidence.nameSimilarityScore,
    },
    lastSeen: iso(candidate.lastSeen),
  };
}

function mapAccount(account: IpAccount): IpAccount {
  return {
    steamId: account.steamId,
    steam64: account.steam64,
    name: account.name,
    firstSeen: iso(account.firstSeen),
    lastSeen: iso(account.lastSeen),
    eventCount: account.eventCount,
  };
}

function mapIpInvestigation(raw: IpInvestigation): IpInvestigation {
  return {
    kind: 'ip',
    ip: raw.ip,
    ipKind: 'usable',
    accounts: raw.accounts.map(mapAccount),
    events: raw.events.map(mapEvent),
  };
}

function mapSteamInvestigation(raw: SteamInvestigation): SteamInvestigation {
  return {
    kind: 'steam',
    steamId: raw.steamId,
    steam64: raw.steam64,
    permName: raw.permName,
    knownNames: [...raw.knownNames],
    distinctIps: raw.distinctIps.map(mapDistinctIp),
    usableIpCount: raw.usableIpCount,
    firstSeen: iso(raw.firstSeen),
    lastSeen: iso(raw.lastSeen),
    eventCount: raw.eventCount,
    sessionCount: raw.sessionCount,
    totalSeconds: raw.totalSeconds,
    events: raw.events.map(mapEvent),
    candidates: raw.candidates.map(mapCandidate),
    linkedAlts: raw.linkedAlts.map(mapLink),
    linkedMain: raw.linkedMain ? mapLink(raw.linkedMain) : null,
    noUsableIps: raw.noUsableIps,
  };
}
