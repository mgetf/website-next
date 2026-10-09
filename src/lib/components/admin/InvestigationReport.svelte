<script lang="ts">
  import { resolve } from '$app/paths';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '#lib/components/ui/DataTable.svelte';
  import FlagIcon from '#lib/components/ui/FlagIcon.svelte';
  import InvestigateChat from '#lib/components/admin/InvestigateChat.svelte';
  import ProfilingSummary from '#lib/components/admin/ProfilingSummary.svelte';
  import type {
    AltCandidate,
    ClientIpKind,
    InvestigateEvent,
    InvestigateResult,
    IpAccount,
  } from '#lib/types/investigation.js';
  import type { ProfilingSnapshot } from '#lib/types/profiling.js';
  import { flagForRegion } from '#lib/utils/regions.js';
  import { steamId3FromSteamId64, steamId64FromAnyFormat } from '#lib/utils/steamid.js';

  let {
    configured = true,
    result,
    profiling = null,
    linkMode = 'search',
  }: {
    configured?: boolean;
    result: InvestigateResult | null;
    profiling?: ProfilingSnapshot | null;
    linkMode?: 'search' | 'profile';
  } = $props();

  const eventColumns: Column[] = [
    { key: 'region', label: 'Region', width: '52px', align: 'center' },
    { key: 'action', label: 'Action', width: '96px' },
    { key: 'name', label: 'Name' },
    { key: 'ip', label: 'IP', width: '140px' },
    { key: 'server', label: 'Server' },
    { key: 'at', label: 'Time', width: '168px' },
  ];

  const steamEventColumns: Column[] = [
    { key: 'region', label: 'Region', width: '4.5rem', align: 'center' },
    { key: 'action', label: 'Action', width: '5.5rem' },
    { key: 'name', label: 'Name', width: '4.5rem' },
    { key: 'ip', label: 'IP', width: '7.25rem' },
    { key: 'server', label: 'Server' },
    { key: 'at', label: 'Time', width: '6.75rem' },
  ];

  const accountColumns: Column[] = [
    { key: 'account', label: 'Account' },
    { key: 'name', label: 'Name' },
    { key: 'events', label: 'Events', align: 'right' },
    { key: 'first', label: 'First seen' },
    { key: 'last', label: 'Last seen' },
  ];

  function formatWhen(value: string | null): string {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const day = date.toLocaleDateString('en-US');
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `${day} ${time}`;
  }

  function formatWhenShort(value: string | null): string {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const day = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${day} ${time}`;
  }

  function formatHours(totalSeconds: number): string {
    return `${Math.round((totalSeconds / 3600) * 10) / 10}h`;
  }

  function ipKindColor(kind: ClientIpKind): 'green' | 'yellow' | 'zinc' {
    if (kind === 'usable') return 'green';
    if (kind === 'sdr') return 'yellow';
    return 'zinc';
  }

  function ipKindLabel(kind: ClientIpKind): string {
    if (kind === 'sdr') return 'SDR';
    if (kind === 'private') return 'Private';
    return 'Usable';
  }

  function candidateColor(label: AltCandidate['label']): 'green' | 'yellow' | 'zinc' {
    if (label === 'Likely') return 'green';
    if (label === 'Possible') return 'yellow';
    return 'zinc';
  }

  function scorePct(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  function avatarSrc(url: string | null | undefined): string {
    return url || '/default-avatar.png';
  }

  function searchHref(query: string): string {
    return `?q=${encodeURIComponent(query)}`;
  }

  function accountHref(steamId: string, steam64: string | null): string {
    if (linkMode === 'profile') {
      const id = steam64 ?? steamId64FromAnyFormat(steamId);
      if (id) return `${resolve('/users/[steamId]', { steamId: id })}?tab=investigate`;
      return `${resolve('admin/investigate')}?q=${encodeURIComponent(steamId)}`;
    }
    return searchHref(steamId);
  }

  function ipHref(ip: string): string {
    if (linkMode === 'profile') {
      return `${resolve('admin/investigate')}?q=${encodeURIComponent(ip)}`;
    }
    return searchHref(ip);
  }
</script>

<div class="space-y-4 sm:space-y-6">
  {#if !configured}
    <Card padding="sm">
      <p class="text-text-body text-sm">
        This tool needs <code class="text-text-label">MGE_PLATFORM_URL</code>
        and <code class="text-text-label">MGE_PLATFORM_ADMIN_SECRET</code> on the website. The
        secret must match platform <code class="text-text-label">ADMIN_SECRET</code>.
      </p>
    </Card>
  {:else if result && result.kind === 'invalid'}
    <Card padding="sm">
      <p class="text-text-body text-sm">
        That query is not a Steam ID, profile URL, personaname, or IPv4 address.
      </p>
    </Card>
  {:else if result && result.kind === 'error'}
    <Card padding="sm">
      <p class="text-danger-400 text-sm">{result.message}</p>
    </Card>
  {:else if result && result.kind === 'blocked-ip'}
    <Card padding="sm">
      <p class="text-text-body text-sm">
        <span class="font-medium text-white">{result.ip}</span>
        is a {result.reason === 'sdr' ? 'Valve SDR relay' : 'private'} address, not a player IP. Account
        lists are not shown for this range.
      </p>
    </Card>
  {:else if result && result.kind === 'not-found'}
    <Card padding="sm">
      <p class="text-text-body text-sm">
        No whois records for
        <span class="font-medium text-white">{result.steamId}</span>.
      </p>
    </Card>
    {#if profiling}
      <ProfilingSummary snapshot={profiling} steam64={result.steam64} />
    {/if}
  {:else if result && result.kind === 'ip'}
    {@const ipResult = result}
    <div class="space-y-4 sm:space-y-6">
      <Card padding="sm">
        {#snippet header()}
          <h2 class="text-base sm:text-lg font-semibold text-white">IP {ipResult.ip}</h2>
        {/snippet}
        <p class="text-text-body mb-4 text-sm">
          {ipResult.accounts.length} account(s) seen on this address.
        </p>
        <DataTable
          data={ipResult.accounts}
          columns={accountColumns}
          dense
          emptyMessage="No accounts"
        >
          {#snippet cell(row: IpAccount, col)}
            {#if col.key === 'account'}
              <a
                class="inline-flex items-center gap-2 text-primary-400 hover:underline min-w-0"
                href={accountHref(row.steamId, row.steam64)}
              >
                <img
                  src={avatarSrc(row.avatar)}
                  alt=""
                  class="size-6 rounded-md shrink-0"
                  width="24"
                  height="24"
                />
                <span class="font-mono text-xs break-all">{row.steamId}</span>
              </a>
            {:else if col.key === 'name'}
              {row.name ?? 'Unknown'}
            {:else if col.key === 'events'}
              {row.eventCount}
            {:else if col.key === 'first'}
              <span class="whitespace-nowrap">{formatWhen(row.firstSeen)}</span>
            {:else}
              <span class="whitespace-nowrap">{formatWhen(row.lastSeen)}</span>
            {/if}
          {/snippet}
        </DataTable>
      </Card>
      <Card padding="sm">
        {#snippet header()}
          <h2 class="text-base sm:text-lg font-semibold text-white">Recent events</h2>
        {/snippet}
        <DataTable data={ipResult.events} columns={eventColumns} dense emptyMessage="No events">
          {#snippet cell(row: InvestigateEvent, col)}
            {#if col.key === 'region'}
              <span
                class="inline-flex justify-center"
                title={row.region.toUpperCase()}
                aria-label={row.region.toUpperCase()}
              >
                <FlagIcon code={flagForRegion(row.region)} class="w-5 h-3.5 rounded-sm" />
              </span>
            {:else if col.key === 'action'}
              <span class="whitespace-nowrap">{row.action}</span>
            {:else if col.key === 'name'}
              {row.name ?? 'Unknown'}
            {:else if col.key === 'ip'}
              {#if row.ip && row.ipKind === 'usable'}
                <a class="text-primary-400 hover:underline whitespace-nowrap" href={ipHref(row.ip)}
                  >{row.ip}</a
                >
              {:else}
                <span class="inline-flex items-center gap-1 whitespace-nowrap">
                  {row.ip ?? 'Unknown'}
                  {#if row.ipKind && row.ipKind !== 'usable'}
                    <Badge color={ipKindColor(row.ipKind)}>{ipKindLabel(row.ipKind)}</Badge>
                  {/if}
                </span>
              {/if}
            {:else if col.key === 'server'}
              {row.serverName ?? row.serverIp}
            {:else}
              <span class="whitespace-nowrap">{formatWhen(row.at)}</span>
            {/if}
          {/snippet}
        </DataTable>
      </Card>
    </div>
  {:else if result && result.kind === 'steam'}
    {@const steam = result}
    {@const steam3 = steam.steam64 ? steamId3FromSteamId64(steam.steam64) : null}
    <div class="space-y-4 sm:space-y-6">
      {#if profiling}
        <ProfilingSummary snapshot={profiling} steam64={steam.steam64} />
      {/if}
      <div class="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card padding="sm">
          {#snippet header()}
            <div class="flex items-stretch gap-3 min-w-0">
              <div
                class="min-h-[4.75rem] min-w-[4.75rem] self-stretch aspect-square shrink-0 overflow-hidden rounded-lg"
              >
                <img src={avatarSrc(steam.avatar)} alt="" class="h-full w-full object-cover" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <h2 class="text-base sm:text-lg font-semibold text-white truncate">
                    {steam.permName ?? steam.knownNames[0] ?? steam.steamId}
                  </h2>
                  {#if steam.steam64}
                    <div class="flex items-center gap-1 shrink-0">
                      <Button
                        href="/users/{steam.steam64}"
                        variant="secondary"
                        size="sm"
                        class="inline-flex items-center justify-center p-2!"
                        aria-label="mge.tf profile"
                        title="mge.tf profile"
                      >
                        <img src="/mge_transparent_logo.png" alt="" class="size-4" />
                      </Button>
                      <Button
                        href="https://steamcommunity.com/profiles/{steam.steam64}"
                        variant="secondary"
                        size="sm"
                        class="inline-flex items-center justify-center p-2!"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Steam profile"
                        title="Steam profile"
                      >
                        <img src="/steam_logo.png" alt="" class="size-4 brightness-0 invert" />
                      </Button>
                    </div>
                  {/if}
                </div>
                <ul
                  class="mt-1 space-y-0.5 font-mono text-[11px] sm:text-xs text-text-muted break-all"
                >
                  <li>{steam.steamId}</li>
                  {#if steam3}
                    <li>{steam3}</li>
                  {/if}
                  {#if steam.steam64}
                    <li>{steam.steam64}</li>
                  {/if}
                </ul>
              </div>
            </div>
          {/snippet}
          <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-text-muted">Sessions</dt>
              <dd class="text-white">{steam.sessionCount}</dd>
            </div>
            <div>
              <dt class="text-text-muted">Playtime</dt>
              <dd class="text-white">{formatHours(steam.totalSeconds)}</dd>
            </div>
            <div>
              <dt class="text-text-muted">First seen</dt>
              <dd class="text-white">{formatWhen(steam.firstSeen)}</dd>
            </div>
            <div>
              <dt class="text-text-muted">Last seen</dt>
              <dd class="text-white">{formatWhen(steam.lastSeen)}</dd>
            </div>
          </dl>
          {#if steam.knownNames.length > 0}
            <p class="text-text-muted text-xs mt-4 mb-2">Names</p>
            <div class="flex flex-wrap gap-2">
              {#each steam.knownNames as name (name)}
                <Badge>{name}</Badge>
              {/each}
            </div>
          {/if}
          {#if steam.distinctIps.length > 0}
            <p class="text-text-muted text-xs mt-4 mb-2">IPs</p>
            <div class="flex flex-wrap gap-2">
              {#each steam.distinctIps as item (`${item.ip}-${item.kind}`)}
                {#if item.kind === 'usable'}
                  <a href={ipHref(item.ip)}>
                    <Badge color={ipKindColor(item.kind)}>{item.ip}</Badge>
                  </a>
                {:else}
                  <Badge color={ipKindColor(item.kind)} tooltip={ipKindLabel(item.kind)}>
                    {item.ip}
                  </Badge>
                {/if}
              {/each}
            </div>
          {/if}
        </Card>

        <Card padding="sm">
          {#snippet header()}
            <h2 class="text-base sm:text-lg font-semibold text-white">Alt network</h2>
          {/snippet}
          {#if steam.linkedMain}
            {@const main = steam.linkedMain}
            <p class="text-text-muted text-xs mb-2">Confirmed main</p>
            <a
              class="inline-flex items-center gap-2 text-primary-400 hover:underline min-w-0"
              href={accountHref(main.mainSteamId ?? main.steamId, main.mainSteam64 ?? main.steam64)}
            >
              <img
                src={avatarSrc(main.avatar)}
                alt=""
                class="size-8 rounded-md shrink-0"
                width="32"
                height="32"
              />
              <span class="break-all">{main.mainSteamId ?? main.steamId}</span>
            </a>
            <p class="text-text-muted text-xs mt-1">
              Linked by {main.linkedBy ?? 'unknown'} in {main.region}
            </p>
          {/if}
          {#if steam.linkedAlts.length > 0}
            <p class="text-text-muted text-xs mt-4 mb-2">Confirmed alts</p>
            <ul class="space-y-2">
              {#each steam.linkedAlts as link (link.region + link.steamId)}
                <li>
                  <a
                    class="inline-flex items-center gap-2 text-primary-400 hover:underline min-w-0"
                    href={accountHref(link.steamId, link.steam64)}
                  >
                    <img
                      src={avatarSrc(link.avatar)}
                      alt=""
                      class="size-8 rounded-md shrink-0"
                      width="32"
                      height="32"
                    />
                    <span class="break-all">{link.steamId}</span>
                  </a>
                  <span class="text-text-muted text-xs">
                    · {link.region} · {formatWhen(link.lastSeen)}</span
                  >
                </li>
              {/each}
            </ul>
          {/if}
          {#if steam.noUsableIps}
            <p class="text-warning-400 text-sm mt-4">
              No usable client IPs. This player only has SDR or private addresses, so alt candidates
              were not scored.
            </p>
          {:else if steam.candidates.length === 0}
            <p class="text-text-muted text-sm mt-4">No alt candidates in the last 90 days.</p>
          {:else}
            <p class="text-text-muted text-xs mt-4 mb-2">Candidates</p>
            <ul class="space-y-2">
              {#each steam.candidates as candidate (candidate.steamId)}
                <li class="border border-border-default rounded-lg p-2 sm:p-3">
                  <div class="flex items-start gap-3 min-w-0">
                    <img
                      src={avatarSrc(candidate.avatar)}
                      alt=""
                      class="size-10 rounded-md shrink-0"
                      width="40"
                      height="40"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <a
                          class="text-white hover:text-primary-400 truncate"
                          href={accountHref(candidate.steamId, candidate.steam64)}
                        >
                          {candidate.knownNames[0] ?? candidate.steamId}
                        </a>
                        <Badge color={candidateColor(candidate.label)}
                          >{candidate.label} {scorePct(candidate.score)}</Badge
                        >
                      </div>
                      <p class="text-text-muted text-xs mt-1 break-all">{candidate.steamId}</p>
                      <p class="text-text-body text-xs mt-1 break-all">
                        Shared IPs: {candidate.sharedIps.join(', ') || 'none'}
                      </p>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <Card padding="none" class="min-w-0 overflow-hidden">
          {#snippet header()}
            <div class="px-4 py-3">
              <h2 class="text-base font-semibold text-white sm:text-lg">
                Recent events ({steam.eventCount})
              </h2>
            </div>
          {/snippet}
          <DataTable
            data={steam.events}
            columns={steamEventColumns}
            dense
            viewportHeight="32rem"
            emptyMessage="No events"
          >
            {#snippet cell(row: InvestigateEvent, col)}
              {#if col.key === 'region'}
                <span
                  class="inline-flex justify-center"
                  title={row.region.toUpperCase()}
                  aria-label={row.region.toUpperCase()}
                >
                  <FlagIcon code={flagForRegion(row.region)} class="w-5 h-3.5 rounded-sm" />
                </span>
              {:else if col.key === 'action'}
                <span class="block truncate" title={row.action}>{row.action}</span>
              {:else if col.key === 'name'}
                <span class="block truncate" title={row.name ?? 'Unknown'}
                  >{row.name ?? 'Unknown'}</span
                >
              {:else if col.key === 'ip'}
                {#if row.ip && row.ipKind === 'usable'}
                  <a
                    class="block truncate text-primary-400 hover:underline"
                    title={row.ip}
                    href={ipHref(row.ip)}>{row.ip}</a
                  >
                {:else}
                  <span class="inline-flex max-w-full items-center gap-1">
                    <span class="truncate">{row.ip ?? 'Unknown'}</span>
                    {#if row.ipKind && row.ipKind !== 'usable'}
                      <Badge color={ipKindColor(row.ipKind)}>{ipKindLabel(row.ipKind)}</Badge>
                    {/if}
                  </span>
                {/if}
              {:else if col.key === 'server'}
                {@const server = row.serverName ?? row.serverIp}
                <span class="block truncate" title={server}>{server}</span>
              {:else}
                <span class="block truncate tabular-nums" title={formatWhen(row.at)}
                  >{formatWhenShort(row.at)}</span
                >
              {/if}
            {/snippet}
          </DataTable>
        </Card>
        {#if steam.steam64}
          <div class="min-w-0">
            {#key steam.steam64}
              <InvestigateChat steamId={steam.steam64} />
            {/key}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
