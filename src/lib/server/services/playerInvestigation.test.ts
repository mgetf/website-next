import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/db.js', () => ({ prisma: {} }));
vi.mock('#lib/server/services/users.js', () => ({
  fetchSteamAvatars: async () => ({}),
  getUserDisplaysByIds: async () => ({}),
}));

import { mapInvestigateResult } from './playerInvestigation';
import type { InvestigateResult, SteamInvestigation } from '#lib/types/investigation.js';

describe('mapInvestigateResult', () => {
  it('copies steam payloads into a serializable shape', () => {
    const steam: SteamInvestigation = {
      kind: 'steam',
      steamId: 'STEAM_0:1:1',
      steam64: '76561197960265730',
      avatar: null,
      permName: 'Main',
      knownNames: ['Main'],
      distinctIps: [{ ip: '1.2.3.4', kind: 'usable' }],
      usableIpCount: 1,
      firstSeen: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-01-02T00:00:00.000Z',
      eventCount: 1,
      sessionCount: 1,
      totalSeconds: 3600,
      events: [
        {
          steamId: 'STEAM_0:1:1',
          name: 'Main',
          action: 'connected',
          at: '2026-01-02T00:00:00.000Z',
          ip: '1.2.3.4',
          ipKind: 'usable',
          serverIp: '10.0.0.1',
          serverName: 'NA #1',
          region: 'na',
        },
      ],
      candidates: [],
      linkedAlts: [],
      linkedMain: null,
      noUsableIps: false,
    };

    expect(mapInvestigateResult(steam)).toEqual(steam);
  });

  it('keeps blocked-ip and not-found kinds', () => {
    const blocked: InvestigateResult = { kind: 'blocked-ip', ip: '169.254.1.1', reason: 'sdr' };
    const missing: InvestigateResult = {
      kind: 'not-found',
      steamId: 'STEAM_0:1:2',
      steam64: null,
    };
    expect(mapInvestigateResult(blocked)).toEqual(blocked);
    expect(mapInvestigateResult(missing)).toEqual(missing);
  });

  it('repairs mojibake in server names', () => {
    const steam: SteamInvestigation = {
      kind: 'steam',
      steamId: 'STEAM_0:1:1',
      steam64: '76561197960265730',
      avatar: null,
      permName: 'Main',
      knownNames: ['Main'],
      distinctIps: [],
      usableIpCount: 0,
      firstSeen: null,
      lastSeen: null,
      eventCount: 1,
      sessionCount: 0,
      totalSeconds: 0,
      events: [
        {
          steamId: 'STEAM_0:1:1',
          name: 'Main',
          action: 'connected',
          at: '2026-01-02T00:00:00.000Z',
          ip: '1.2.3.4',
          ipKind: 'usable',
          serverIp: '10.0.0.1',
          serverName: 'mge.tf | sÃ£o paulo #1 | triumph',
          region: 'sa',
        },
      ],
      candidates: [],
      linkedAlts: [],
      linkedMain: null,
      noUsableIps: true,
    };

    const mapped = mapInvestigateResult(steam);
    expect(mapped.kind).toBe('steam');
    if (mapped.kind !== 'steam') return;
    expect(mapped.events[0]?.serverName).toBe('mge.tf | são paulo #1 | triumph');
  });
});
