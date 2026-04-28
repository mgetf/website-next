<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type { ParsedMatch, KillEvent } from '$lib/types/matchLog';

  interface PageLog {
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
    rawLogUrl: string | null;
    parsedData: ParsedMatch;
  }

  let { data }: { data: { log: PageLog } } = $props();

  let killEventsPage = $state(1);
  const KILLS_PER_PAGE = 25;

  const killEvents = $derived(
    data.log.parsedData.events.filter((e): e is KillEvent => e.type === 'kill'),
  );
  const killEventsTotalPages = $derived(Math.ceil(killEvents.length / KILLS_PER_PAGE));
  const pagedKillEvents = $derived(
    killEvents.slice((killEventsPage - 1) * KILLS_PER_PAGE, killEventsPage * KILLS_PER_PAGE),
  );

  function formatTimestamp(iso: string): string {
    return new Date(iso).toISOString().slice(11, 19);
  }

  function formatDuration(sec: number | null): string {
    if (sec === null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function getPlayerName(steamId: string): string {
    return data.log.parsedData.players.find((p) => p.steamId === steamId)?.name ?? steamId;
  }

  function formatAccuracy(acc: number | null): string {
    if (acc === null) return '—';
    return `${acc.toFixed(1)}%`;
  }

  function weaponAccuracy(shotsFired: number, shotsHit: number): string {
    if (shotsFired === 0) return '—';
    return `${((shotsHit / shotsFired) * 100).toFixed(1)}%`;
  }

  const killColumns: Column[] = [
    { key: 'time', label: 'Time', width: '90px' },
    { key: 'killer', label: 'Killer' },
    { key: 'victim', label: 'Victim' },
    { key: 'weapon', label: 'Weapon' },
    { key: 'flags', label: 'Flags', align: 'center', width: '90px' },
  ];
</script>

<svelte:head>
  <title>{data.log.hostname ?? 'Unknown Server'} — #{data.log.mgeMatchId} — MGE.TF</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
  <!-- Header -->
  <div>
    <a href="/logs" class="text-sm text-text-muted hover:text-white transition-colors">
      ← Back to Logs
    </a>
    <div class="mt-3 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-3xl font-bold text-white">
          {data.log.hostname ?? 'Unknown Server'} — #{data.log.mgeMatchId}
        </h1>
        <div class="mt-2 flex items-center gap-2 flex-wrap text-text-body">
          <span>{data.log.map}</span>
          {#if data.log.arena}
            <span class="text-text-muted">•</span>
            <span>{data.log.arena}</span>
          {/if}
          <span class="text-text-muted">•</span>
          <Badge color={data.log.format === '1v1' ? 'blue' : 'green'}>{data.log.format}</Badge>
          {#if data.log.aborted}
            <Badge color="red">Aborted</Badge>
          {/if}
        </div>
        <p class="mt-1 text-sm text-text-muted">
          {formatDate(data.log.startedAt)}{#if data.log.durationSec !== null}
            · {formatDuration(data.log.durationSec)}{/if}
        </p>
      </div>
      {#if data.log.rawLogUrl}
        <Button variant="secondary" size="sm" href={data.log.rawLogUrl} target="_blank">
          Download Raw Log
        </Button>
      {/if}
    </div>
  </div>

  <!-- Players -->
  <div>
    <h2 class="text-xl font-semibold text-white mb-4">Players</h2>
    <div class="grid gap-4 md:grid-cols-2">
      {#each data.log.parsedData.players as player (player.steamId)}
        <Card>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                {#if player.won}
                  <span class="text-warning-400 text-lg" aria-label="Winner">★</span>
                {/if}
                <span class="text-lg font-semibold text-white">{player.name}</span>
              </div>
              <div class="flex items-center gap-2">
                <Badge color={player.team === 'Red' ? 'red' : 'blue'}>{player.team}</Badge>
                <span class="text-text-muted text-sm">{player.startClass}</span>
              </div>
            </div>

            <div class="text-center">
              <div class="text-2xl font-bold text-white">{player.score}</div>
              <div class="text-xs text-text-muted uppercase tracking-wide">Score</div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">Kills</div>
                <div class="text-white font-medium">{player.stats.kills}</div>
              </div>
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">Deaths</div>
                <div class="text-white font-medium">{player.stats.deaths}</div>
              </div>
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">DPM</div>
                <div class="text-white font-medium">{player.stats.dpm.toFixed(0)}</div>
              </div>
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">Accuracy</div>
                <div class="text-white font-medium">{formatAccuracy(player.stats.accuracy)}</div>
              </div>
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">Airshots</div>
                <div class="text-white font-medium">{player.stats.airshots}</div>
              </div>
              <div class="bg-surface-input rounded-md p-2">
                <div class="text-text-muted text-xs">Headshots</div>
                <div class="text-white font-medium">{player.stats.headshotKills}</div>
              </div>
            </div>

            {#if player.elo !== null}
              <div class="border-t border-border-default pt-3">
                <div class="text-xs text-text-muted uppercase tracking-wide mb-1">ELO</div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-text-body">{player.elo.before}</span>
                  <span class="text-text-muted">→</span>
                  <span class="text-text-body">{player.elo.after}</span>
                  {#if player.elo.delta > 0}
                    <span class="text-success-400 font-medium">+{player.elo.delta}</span>
                  {:else if player.elo.delta < 0}
                    <span class="text-danger-400 font-medium">{player.elo.delta}</span>
                  {:else}
                    <span class="text-text-muted font-medium">±0</span>
                  {/if}
                </div>
              </div>
            {/if}

            {#if Object.keys(player.stats.weaponBreakdown).length > 0}
              <div class="border-t border-border-default pt-3">
                <div class="text-xs text-text-muted uppercase tracking-wide mb-2">
                  Weapon Breakdown
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th scope="col" class="pb-1 text-xs text-text-muted font-medium text-left"
                          >Weapon</th
                        >
                        <th scope="col" class="pb-1 text-xs text-text-muted font-medium text-right"
                          >Kills</th
                        >
                        <th scope="col" class="pb-1 text-xs text-text-muted font-medium text-right"
                          >Damage</th
                        >
                        <th scope="col" class="pb-1 text-xs text-text-muted font-medium text-right"
                          >Accuracy</th
                        >
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border-default">
                      {#each Object.entries(player.stats.weaponBreakdown) as [weapon, wStats] (weapon)}
                        <tr>
                          <td class="py-1 text-text-body capitalize">{weapon}</td>
                          <td class="py-1 text-text-body text-right">{wStats.kills}</td>
                          <td class="py-1 text-text-body text-right">{wStats.damage}</td>
                          <td class="py-1 text-text-body text-right"
                            >{weaponAccuracy(wStats.shotsFired, wStats.shotsHit)}</td
                          >
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}
          </div>
        </Card>
      {/each}
    </div>
  </div>

  <!-- Kill Events Timeline -->
  <div>
    <h2 class="text-xl font-semibold text-white mb-4">Kill Events</h2>
    <DataTable
      data={pagedKillEvents}
      columns={killColumns}
      compact={true}
      emptyMessage="No kill events recorded."
      pagination={killEventsTotalPages > 1
        ? {
            currentPage: killEventsPage,
            totalPages: killEventsTotalPages,
            onPageChange: (p) => {
              killEventsPage = p;
            },
            infoText: `${killEvents.length} kill events`,
          }
        : undefined}
    >
      {#snippet cell(event, col)}
        {#if col.key === 'time'}
          <span class="font-mono text-text-muted text-xs">{formatTimestamp(event.timestamp)}</span>
        {:else if col.key === 'killer'}
          <span class="text-text-label">{getPlayerName(event.attackerSteamId)}</span>
        {:else if col.key === 'victim'}
          <span class="text-text-label">{getPlayerName(event.victimSteamId)}</span>
        {:else if col.key === 'weapon'}
          <span class="text-text-body capitalize">{event.weapon}</span>
        {:else if col.key === 'flags'}
          {#if event.headshot || event.airshot}
            <div class="flex items-center justify-center gap-1">
              {#if event.headshot}
                <Badge color="orange">HS</Badge>
              {/if}
              {#if event.airshot}
                <Badge color="blue">AS</Badge>
              {/if}
            </div>
          {:else}
            <span class="text-text-muted">—</span>
          {/if}
        {/if}
      {/snippet}
    </DataTable>
  </div>

  <!-- Chat Log -->
  {#if data.log.parsedData.chat.length > 0}
    <div>
      <h2 class="text-xl font-semibold text-white mb-4">Chat Log</h2>
      <Card>
        <div class="space-y-1">
          {#each data.log.parsedData.chat as msg, i (i)}
            <div class="flex items-start gap-3 text-sm py-1">
              <span class="font-mono text-text-muted text-xs shrink-0 mt-0.5">
                {formatTimestamp(msg.timestamp)}
              </span>
              <span class="text-text-label font-medium shrink-0">{getPlayerName(msg.steamId)}</span>
              {#if msg.scope === 'team'}
                <Badge color="zinc">TEAM</Badge>
              {/if}
              <span class="text-text-body break-words min-w-0">{msg.message}</span>
            </div>
          {/each}
        </div>
      </Card>
    </div>
  {/if}
</div>
