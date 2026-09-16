export function winPct(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return '0';
  return String(Math.round((wins / total) * 100));
}

export function statusLabel(status: string): string {
  if (status === 'READY' || status === 'PLACEMENT') return 'Active';
  if (status === 'PENDING') return 'Pending';
  if (status === 'UNREADY') return 'Unready';
  if (status === 'DEAD') return 'Withdrawn';
  return status;
}

export function statusColor(status: string): 'green' | 'yellow' | 'zinc' | 'red' {
  if (status === 'READY' || status === 'PLACEMENT') return 'green';
  if (status === 'PENDING') return 'yellow';
  if (status === 'DEAD') return 'red';
  return 'zinc';
}

export function resultClass(result: string): string {
  if (result === 'W') return 'text-success-400';
  if (result === 'L') return 'text-danger-400';
  return 'text-text-body';
}

export function placementClass(placement: string): string {
  if (placement.includes('1st')) return 'text-warning-400';
  if (placement.includes('2nd')) return 'text-text-label';
  if (placement.includes('3rd')) return 'text-primary-400';
  return 'text-text-body';
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return 'N/A';
  return value.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const sec = (Date.now() - date.getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return formatDate(iso);
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return '—';
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function chartPointsFromSeries(
  series: { at: string; rating: number }[],
): { label: string; value: number }[] {
  return series.map((point) => ({
    label: new Date(point.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: point.rating,
  }));
}

export function teamFormatsIn(
  teams: { formatCode: string; formatName: string; formatIconUrl?: string | null }[],
) {
  const seen = new Map<string, { code: string; name: string; iconUrl: string | null }>();
  for (const team of teams) {
    if (!seen.has(team.formatCode)) {
      seen.set(team.formatCode, {
        code: team.formatCode,
        name: team.formatName,
        iconUrl: team.formatIconUrl ?? null,
      });
    }
  }
  return [...seen.values()];
}

export function parseProfileTab(raw: string | null): 'overview' | '1v1' | 'stats' {
  if (raw === '1v1' || raw === 'stats') return raw;
  return 'overview';
}

export function profileExternalLinks(steamId: string, steam2: string) {
  return [
    {
      name: 'Steam',
      url: `https://steamcommunity.com/profiles/${steamId}`,
      logo: '/steam_logo.png',
    },
    {
      name: 'logs.tf',
      url: `https://logs.tf/profile/${steamId}`,
      logo: '/logstf_logo.png',
    },
    {
      name: 'RGL',
      url: `https://rgl.gg/Public/PlayerProfile.aspx?p=${steamId}`,
      logo: '/rgl_logo.png',
    },
    {
      name: 'ETF2L',
      url: `https://etf2l.org/search/${steamId}/`,
      logo: '/etf2l_logo.png',
    },
    {
      name: 'UGC-Gaming',
      url: `https://stats.ugc-gaming.net/mge-stats/?search=${encodeURIComponent(steam2)}`,
      logo: '/ugcgaming_logo.png',
    },
    {
      name: 'SteamHistory',
      url: `https://steamhistory.net/id/${steamId}`,
      logo: '/steamhistory_logo.jpg',
      rounded: true,
    },
    {
      name: 'SteamLadder',
      url: `https://steamladder.com/profile/${steamId}/`,
      logo: '/steamladder_logo.png',
    },
  ];
}
