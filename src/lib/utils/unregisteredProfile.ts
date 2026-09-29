export function buildUnregisteredPlayerProfile(
  steamId: string,
  steam: { personaname: string; avatarfull: string } | null,
) {
  return {
    registered: false as const,
    player: {
      steamId,
      name: steam?.personaname || 'Unknown player',
      avatar: steam?.avatarfull ?? null,
      discordLinked: false,
      discordUsername: null,
      permissionLevel: 'GUEST',
      banStatus: 'NONE',
      punishmentCount: 0,
      nameOverride: 0,
      avatarOverride: 0,
      staffAssignments: [] as { formatName: string; divisionName: string; regionName: string }[],
    },
    currentTeams: [],
    teamHistory: [],
    tournaments: [] as { id: number; name: string; date: string | null; placement: string }[],
    fightNights: [] as {
      id: number;
      fightNightName: string;
      opponent: string;
      result: string;
      score: string;
      date: string | null;
    }[],
    achievements: [] as { placement: string; event: string; date: string | null }[],
    current1v1Entry: null,
    entries1v1: [],
  };
}
