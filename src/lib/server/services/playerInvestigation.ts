import { prisma } from '$lib/server/db';
import { getOptionalEnv } from '$lib/server/utils/env';
import {
  investigatePlayer,
  isPlatformInvestigateConfigured,
} from '$lib/server/clients/mgePlatform';
import { fetchSteamAvatars, getUserDisplaysByIds } from '$lib/server/services/users';
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
import { extractSteamVanity, steamId64FromAnyFormat } from '$lib/utils/steamid';
import { repairUtf8Mojibake } from '$lib/utils/textEncoding';

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isPlayerInvestigationConfigured(): boolean {
  return isPlatformInvestigateConfigured();
}

export async function getPlayerInvestigation(query: string): Promise<InvestigateResult> {
  const q = query.trim();
  if (!q) return { kind: 'invalid' };
  const resolved = await resolveInvestigateQuery(q);
  const mapped = mapInvestigateResult(await investigatePlayer(resolved));
  return decorateAvatars(mapped);
}

async function resolveInvestigateQuery(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const fromId = steamId64FromAnyFormat(trimmed);
  if (fromId) return fromId;

  if (IPV4_RE.test(trimmed)) return trimmed;

  const vanityFromUrl = extractSteamVanity(trimmed);
  if (vanityFromUrl) {
    const resolved = await resolveSteamVanity(vanityFromUrl);
    if (resolved) return resolved;
  }

  if (looksLikeVanityToken(trimmed)) {
    const resolved = await resolveSteamVanity(trimmed);
    if (resolved) return resolved;
  }

  const fromName = await findUserSteamIdByName(trimmed);
  if (fromName) return fromName;

  return trimmed;
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
  const serverName = event.serverName ? repairUtf8Mojibake(event.serverName) : event.serverName;
  return {
    steamId: event.steamId,
    name: event.name,
    action: event.action,
    at: iso(event.at) ?? event.at,
    ip: event.ip,
    ipKind: event.ipKind,
    serverIp: event.serverIp,
    serverName,
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
    avatar: link.avatar ?? null,
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
    avatar: candidate.avatar ?? null,
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
    avatar: account.avatar ?? null,
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
    avatar: raw.avatar ?? null,
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

function looksLikeVanityToken(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/.test(value);
}

async function resolveSteamVanity(vanity: string): Promise<string | null> {
  const apiKey = getOptionalEnv('STEAM_API_KEY');
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { success?: number; steamid?: string } };
    if (data.response?.success !== 1) return null;
    const steamid = data.response.steamid;
    return steamid ? steamId64FromAnyFormat(steamid) : null;
  } catch {
    return null;
  }
}

async function findUserSteamIdByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = await prisma.user.findFirst({
    where: { steamUsername: { equals: trimmed, mode: 'insensitive' } },
    select: { steamId: true },
  });
  if (exact) return exact.steamId;

  const matches = await prisma.user.findMany({
    where: { steamUsername: { contains: trimmed, mode: 'insensitive' } },
    select: { steamId: true, steamUsername: true },
    take: 5,
  });
  if (matches.length === 1) return matches[0].steamId;
  return null;
}

function collectSteam64s(result: InvestigateResult): string[] {
  const ids: (string | null | undefined)[] = [];
  if (result.kind === 'steam') {
    ids.push(result.steam64);
    for (const candidate of result.candidates) ids.push(candidate.steam64);
    for (const link of result.linkedAlts) ids.push(link.steam64);
    if (result.linkedMain) {
      ids.push(result.linkedMain.steam64);
      ids.push(result.linkedMain.mainSteam64);
    }
  } else if (result.kind === 'ip') {
    for (const account of result.accounts) ids.push(account.steam64);
  } else if (result.kind === 'not-found') {
    ids.push(result.steam64);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

async function decorateAvatars(result: InvestigateResult): Promise<InvestigateResult> {
  const steam64s = collectSteam64s(result);
  if (steam64s.length === 0) return result;

  const [dbDisplays, steamAvatars] = await Promise.all([
    getUserDisplaysByIds(steam64s),
    fetchSteamAvatars(steam64s),
  ]);

  const avatarOf = (steam64: string | null | undefined): string | null => {
    if (!steam64) return null;
    return steamAvatars[steam64] ?? dbDisplays[steam64]?.avatar ?? null;
  };

  if (result.kind === 'steam') {
    return {
      ...result,
      avatar: avatarOf(result.steam64),
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        avatar: avatarOf(candidate.steam64),
      })),
      linkedAlts: result.linkedAlts.map((link) => ({
        ...link,
        avatar: avatarOf(link.steam64),
      })),
      linkedMain: result.linkedMain
        ? {
            ...result.linkedMain,
            avatar: avatarOf(result.linkedMain.mainSteam64 ?? result.linkedMain.steam64),
          }
        : null,
    };
  }

  if (result.kind === 'ip') {
    return {
      ...result,
      accounts: result.accounts.map((account) => ({
        ...account,
        avatar: avatarOf(account.steam64),
      })),
    };
  }

  return result;
}
