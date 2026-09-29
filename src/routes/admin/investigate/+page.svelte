<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type {
    AltCandidate,
    ClientIpKind,
    InvestigateEvent,
    IpAccount,
  } from '$lib/types/investigation';

  let { data }: { data: PageData } = $props();

  let query = $state<string | null>('');
  $effect(() => {
    query = data.q;
  });

  const eventColumns: Column[] = [
    { key: 'at', label: 'Time', width: '160px' },
    { key: 'action', label: 'Action', width: '110px' },
    { key: 'name', label: 'Name' },
    { key: 'ip', label: 'IP', width: '140px' },
    { key: 'server', label: 'Server' },
    { key: 'region', label: 'Region', width: '80px' },
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
    return date.toLocaleString();
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
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold text-white">Investigate</h1>
    <p class="text-text-body mt-1">
      Search a Steam ID or IPv4 across mirrored whois logs. Alt matches ignore SDR relays and
      private IPs.
    </p>
  </div>

  {#if !data.configured}
    <Card>
      <p class="text-text-body">
        This tool needs <code class="text-text-label">MGE_PLATFORM_URL</code>
        and <code class="text-text-label">MGE_PLATFORM_ADMIN_SECRET</code> on the website. The
        secret must match platform <code class="text-text-label">ADMIN_SECRET</code>.
      </p>
    </Card>
  {:else}
    <Card>
      <form method="GET" class="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div class="flex-1">
          <FormInput
            label="Steam ID or IP"
            name="q"
            bind:value={query}
            placeholder="STEAM_0:1:…, [U:1:…], Steam64, or IPv4"
          />
        </div>
        <Button type="submit" variant="primary">Search</Button>
      </form>
    </Card>

    {#if !data.result}
      <p class="text-text-muted text-sm">
        Enter a Steam ID or public IPv4 to load connection history and alt candidates.
      </p>
    {:else if data.result.kind === 'invalid'}
      <Card>
        <p class="text-text-body">That query is not a Steam ID or IPv4 address.</p>
      </Card>
    {:else if data.result.kind === 'error'}
      <Card>
        <p class="text-danger-400">{data.result.message}</p>
      </Card>
    {:else if data.result.kind === 'blocked-ip'}
      <Card>
        <p class="text-text-body">
          <span class="font-medium text-white">{data.result.ip}</span>
          is a {data.result.reason === 'sdr' ? 'Valve SDR relay' : 'private'} address, not a player IP.
          Account lists are not shown for this range.
        </p>
      </Card>
    {:else if data.result.kind === 'not-found'}
      <Card>
        <p class="text-text-body">
          No whois records for
          <span class="font-medium text-white">{data.result.steamId}</span>.
        </p>
      </Card>
    {:else if data.result.kind === 'ip'}
      {@const ipResult = data.result}
      <Card>
        {#snippet header()}
          <h2 class="text-lg font-semibold text-white">IP {ipResult.ip}</h2>
        {/snippet}
        <p class="text-text-body mb-4">
          {ipResult.accounts.length} account(s) seen on this address.
        </p>
        <DataTable
          data={ipResult.accounts}
          columns={accountColumns}
          compact
          emptyMessage="No accounts"
        >
          {#snippet cell(row: IpAccount, col)}
            {#if col.key === 'account'}
              <a
                class="text-primary-400 hover:underline"
                href="?q={encodeURIComponent(row.steamId)}"
              >
                {row.steamId}
              </a>
            {:else if col.key === 'name'}
              {row.name ?? 'Unknown'}
            {:else if col.key === 'events'}
              {row.eventCount}
            {:else if col.key === 'first'}
              {formatWhen(row.firstSeen)}
            {:else}
              {formatWhen(row.lastSeen)}
            {/if}
          {/snippet}
        </DataTable>
      </Card>
      <Card>
        {#snippet header()}
          <h2 class="text-lg font-semibold text-white">Recent events</h2>
        {/snippet}
        <DataTable data={ipResult.events} columns={eventColumns} compact emptyMessage="No events">
          {#snippet cell(row: InvestigateEvent, col)}
            {#if col.key === 'at'}
              {formatWhen(row.at)}
            {:else if col.key === 'action'}
              {row.action}
            {:else if col.key === 'name'}
              {row.name ?? 'Unknown'}
            {:else if col.key === 'ip'}
              {row.ip ?? 'Unknown'}
            {:else if col.key === 'server'}
              {row.serverName ?? row.serverIp}
            {:else}
              {row.region}
            {/if}
          {/snippet}
        </DataTable>
      </Card>
    {:else}
      {@const steam = data.result}
      <div class="grid gap-6 xl:grid-cols-2">
        <Card>
          {#snippet header()}
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="text-lg font-semibold text-white">
                {steam.permName ?? steam.knownNames[0] ?? steam.steamId}
              </h2>
              {#if steam.steam64}
                <a
                  class="text-sm text-primary-400 hover:underline"
                  href="https://steamcommunity.com/profiles/{steam.steam64}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Steam profile
                </a>
              {/if}
            </div>
          {/snippet}
          <p class="text-text-muted text-sm mb-4">{steam.steamId}</p>
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
                  <a href="?q={encodeURIComponent(item.ip)}">
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

        <Card>
          {#snippet header()}
            <h2 class="text-lg font-semibold text-white">Alt network</h2>
          {/snippet}
          {#if steam.linkedMain}
            {@const main = steam.linkedMain}
            <p class="text-text-muted text-xs mb-2">Confirmed main</p>
            <a
              class="text-primary-400 hover:underline"
              href="?q={encodeURIComponent(main.mainSteamId ?? main.steamId)}"
            >
              {main.mainSteamId ?? main.steamId}
            </a>
            <p class="text-text-muted text-xs">
              Linked by {main.linkedBy ?? 'unknown'} in {main.region}
            </p>
          {/if}
          {#if steam.linkedAlts.length > 0}
            <p class="text-text-muted text-xs mt-4 mb-2">Confirmed alts</p>
            <ul class="space-y-2">
              {#each steam.linkedAlts as link (link.region + link.steamId)}
                <li>
                  <a
                    class="text-primary-400 hover:underline"
                    href="?q={encodeURIComponent(link.steamId)}"
                  >
                    {link.steamId}
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
            <ul class="space-y-3">
              {#each steam.candidates as candidate (candidate.steamId)}
                <li class="border border-border-default rounded-lg p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <a
                      class="text-white hover:text-primary-400"
                      href="?q={encodeURIComponent(candidate.steamId)}"
                    >
                      {candidate.knownNames[0] ?? candidate.steamId}
                    </a>
                    <Badge color={candidateColor(candidate.label)}
                      >{candidate.label} {scorePct(candidate.score)}</Badge
                    >
                  </div>
                  <p class="text-text-muted text-xs mt-1">{candidate.steamId}</p>
                  <p class="text-text-body text-xs mt-1">
                    Shared IPs: {candidate.sharedIps.join(', ') || 'none'}
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>

      <Card>
        {#snippet header()}
          <h2 class="text-lg font-semibold text-white">Recent events ({steam.eventCount})</h2>
        {/snippet}
        <DataTable data={steam.events} columns={eventColumns} compact emptyMessage="No events">
          {#snippet cell(row: InvestigateEvent, col)}
            {#if col.key === 'at'}
              {formatWhen(row.at)}
            {:else if col.key === 'action'}
              {row.action}
            {:else if col.key === 'name'}
              {row.name ?? 'Unknown'}
            {:else if col.key === 'ip'}
              {#if row.ip && row.ipKind === 'usable'}
                <a class="text-primary-400 hover:underline" href="?q={encodeURIComponent(row.ip)}"
                  >{row.ip}</a
                >
              {:else}
                <span>{row.ip ?? 'Unknown'}</span>
                {#if row.ipKind && row.ipKind !== 'usable'}
                  <Badge color={ipKindColor(row.ipKind)}>{ipKindLabel(row.ipKind)}</Badge>
                {/if}
              {/if}
            {:else if col.key === 'server'}
              {row.serverName ?? row.serverIp}
            {:else}
              {row.region}
            {/if}
          {/snippet}
        </DataTable>
      </Card>
    {/if}
  {/if}
</div>
