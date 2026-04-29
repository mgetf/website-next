<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import { formatWeaponName } from '$lib/utils/weaponNames';
  import { classIcon } from '$lib/utils/classIcons';
  import { cleanArenaName } from '$lib/utils/arenaNames';
  import type { ParsedMatch, KillEvent, PlayerRecord } from '$lib/types/matchLog';

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

  const log = $derived(data.log);
  const players = $derived(log.parsedData.players);

  const killEvents = $derived(
    log.parsedData.events.filter((e): e is KillEvent => e.type === 'kill'),
  );
  const killEventsTotalPages = $derived(Math.ceil(killEvents.length / KILLS_PER_PAGE));
  const pagedKillEvents = $derived(
    killEvents.slice((killEventsPage - 1) * KILLS_PER_PAGE, killEventsPage * KILLS_PER_PAGE),
  );

  // Team aggregation — works for both 1v1 and 2v2
  const winningPlayers = $derived(players.filter((p) => p.won));
  const losingPlayers = $derived(players.filter((p) => !p.won));
  const winnerScore = $derived(
    winningPlayers.length > 0 ? Math.max(...winningPlayers.map((p) => p.score)) : 0,
  );
  const loserScore = $derived(
    losingPlayers.length > 0 ? Math.max(...losingPlayers.map((p) => p.score)) : 0,
  );
  const winnerTeam = $derived(winningPlayers[0]?.team ?? null);
  const loserTeam = $derived(losingPlayers[0]?.team ?? null);
  const winnerNames = $derived(winningPlayers.map((p) => p.name).join(' & '));
  const loserNames = $derived(losingPlayers.map((p) => p.name).join(' & '));

  const showHero = $derived(!log.aborted && winningPlayers.length > 0 && losingPlayers.length > 0);
  const isOneVsOne = $derived(log.format === '1v1' && players.length === 2);

  // ELO summary used in the hero (only meaningful in 1v1 where each side is a single player)
  const winnerEloDelta = $derived(isOneVsOne ? (winningPlayers[0]?.elo?.delta ?? null) : null);
  const loserEloDelta = $derived(isOneVsOne ? (losingPlayers[0]?.elo?.delta ?? null) : null);
  const winnerEloAfter = $derived(isOneVsOne ? (winningPlayers[0]?.elo?.after ?? null) : null);
  const winnerEloBefore = $derived(isOneVsOne ? (winningPlayers[0]?.elo?.before ?? null) : null);
  const loserEloAfter = $derived(isOneVsOne ? (losingPlayers[0]?.elo?.after ?? null) : null);
  const loserEloBefore = $derived(isOneVsOne ? (losingPlayers[0]?.elo?.before ?? null) : null);

  // Team-aggregated stats for the head-to-head comparison strip.
  // 1v1: just the player's own stats. 2v2: damage summed, dpm averaged, accuracy weighted by shots fired.
  type SideStats = {
    damage: number;
    dpm: number;
    accuracy: number | null;
  };
  function aggregateStats(side: PlayerRecord[]): SideStats {
    const damage = side.reduce((acc, p) => acc + p.stats.damageDone, 0);
    const dpms = side.map((p) => p.stats.dpm).filter((d) => d > 0);
    const dpm = dpms.length > 0 ? dpms.reduce((a, b) => a + b, 0) / dpms.length : 0;
    const shotsFired = side.reduce((acc, p) => acc + p.stats.shotsFired, 0);
    const shotsHit = side.reduce((acc, p) => acc + p.stats.shotsHit, 0);
    const accuracy = shotsFired > 0 ? (shotsHit / shotsFired) * 100 : null;
    return { damage, dpm, accuracy };
  }

  const winnerStats = $derived(aggregateStats(winningPlayers));
  const loserStats = $derived(aggregateStats(losingPlayers));

  const showComparison = $derived(
    showHero &&
      (winnerStats.damage > 0 ||
        loserStats.damage > 0 ||
        winnerStats.accuracy !== null ||
        loserStats.accuracy !== null),
  );

  // Static bar color classes — Tailwind v4 cannot interpolate dynamic class names.
  const winnerBarClass = $derived(winnerTeam === 'Red' ? 'bg-danger-500' : 'bg-info-500');
  const loserBarClass = $derived(loserTeam === 'Red' ? 'bg-danger-500' : 'bg-info-500');

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

  function formatEloDelta(delta: number | null): string {
    if (delta === null) return '—';
    if (delta > 0) return `+${delta}`;
    if (delta < 0) return `${delta}`;
    return '±0';
  }

  // Solid (non-blurred) offset shadow tinted by team. Color identity moves from a chip into the type itself.
  // Emphasis is conditional: bold for the highlighted side, muted for the greyed-out side, so the shadow
  // never overpowers the text it sits behind.
  function teamShadow(
    team: 'Red' | 'Blue' | null,
    scale: 'name' | 'score',
    emphasis: 'bold' | 'muted',
  ): string {
    if (!team) return '';
    const baseColor = team === 'Red' ? 'var(--color-danger-500)' : 'var(--color-info-500)';
    const color =
      emphasis === 'muted' ? `color-mix(in srgb, ${baseColor} 35%, transparent)` : baseColor;
    const offset =
      scale === 'score'
        ? emphasis === 'muted'
          ? '0.3rem'
          : '0.5rem'
        : emphasis === 'muted'
          ? '0.1rem'
          : '0.18rem';
    return `text-shadow: ${offset} ${offset} 0 ${color};`;
  }

  function getPlayerName(steamId: string): string {
    return players.find((p) => p.steamId === steamId)?.name ?? steamId;
  }

  function getPlayerTeam(steamId: string): 'Red' | 'Blue' | null {
    return players.find((p) => p.steamId === steamId)?.team ?? null;
  }

  function formatAccuracy(acc: number | null): string {
    if (acc === null) return '—';
    return `${acc.toFixed(1)}%`;
  }

  function weaponAccuracy(shotsFired: number, shotsHit: number): string {
    if (shotsFired === 0) return '—';
    return `${((shotsHit / shotsFired) * 100).toFixed(1)}%`;
  }

  type WeaponEntry = [string, PlayerRecord['stats']['weaponBreakdown'][string]];

  function filteredWeapons(player: PlayerRecord): WeaponEntry[] {
    // 'world' is environmental damage / suicides — not a real weapon, drop it.
    // Sort by damage desc so the most impactful weapon leads.
    return Object.entries(player.stats.weaponBreakdown)
      .filter(([weapon, w]) => weapon !== 'world' && (w.kills > 0 || w.damage > 0))
      .sort(([, a], [, b]) => b.damage - a.damage);
  }

  function weaponKillsPct(player: PlayerRecord, w: WeaponEntry[1]): number | null {
    if (player.stats.kills === 0) return null;
    return Math.round((w.kills / player.stats.kills) * 100);
  }

  function weaponDamagePct(player: PlayerRecord, w: WeaponEntry[1]): number | null {
    if (player.stats.damageDone === 0) return null;
    return Math.round((w.damage / player.stats.damageDone) * 100);
  }

  const winnerWeaponPlayers = $derived(
    winningPlayers.filter((p) => filteredWeapons(p).length > 0),
  );
  const loserWeaponPlayers = $derived(losingPlayers.filter((p) => filteredWeapons(p).length > 0));

  const cleanedArena = $derived(cleanArenaName(log.arena));

  // Match Flow timeline — every kill becomes a colored segment in chronological order.
  type FlowSegment = {
    team: 'Red' | 'Blue' | null;
    timestamp: string;
    attacker: string;
    victim: string;
    weapon: string;
  };
  const flowSegments = $derived<FlowSegment[]>(
    killEvents.map((k) => ({
      team: getPlayerTeam(k.attackerSteamId),
      timestamp: k.timestamp,
      attacker: getPlayerName(k.attackerSteamId),
      victim: getPlayerName(k.victimSteamId),
      weapon: k.weapon,
    })),
  );

  const killColumns: Column[] = [
    { key: 'time', label: 'Time', width: '90px' },
    { key: 'killer', label: 'Killer' },
    { key: 'victim', label: 'Victim' },
    { key: 'weapon', label: 'Weapon' },
    { key: 'flags', label: 'Flags', align: 'center', width: '90px' },
  ];
</script>

<svelte:head>
  <title
    >{showHero ? `${winnerNames} defeated ${loserNames}` : (log.hostname ?? 'Match Log')} — MGE.TF</title
  >
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
  <!-- Top bar: back link + raw log download -->
  <div class="flex items-center justify-between gap-4">
    <a
      href="/logs"
      class="text-sm text-text-muted hover:text-white transition-colors inline-flex items-center gap-1"
    >
      ← Back to Logs
    </a>
    {#if log.rawLogUrl}
      <Button variant="secondary" size="sm" href={log.rawLogUrl} target="_blank">
        Download Raw Log
      </Button>
    {/if}
  </div>

  <!-- Match result hero — the headline of the page -->
  <Card padding="lg">
    <div class="space-y-8">
      <!-- Format + status pills -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <Badge color={log.format === '1v1' ? 'purple' : 'blue'} size="md">
            {log.format.toUpperCase()}
          </Badge>
          <span class="text-xs uppercase tracking-[0.2em] text-text-muted font-semibold">
            {log.gamemode}
          </span>
          {#if log.aborted}
            <Badge color="red" size="md">Aborted</Badge>
          {/if}
        </div>
        <span class="text-xs uppercase tracking-[0.2em] text-text-muted font-mono">
          #{log.mgeMatchId}
        </span>
      </div>

      {#if showHero}
        <!-- Scoreboard layout: scores anchored tight in the center, player info hugs inward from the sides -->
        <div
          class="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 md:gap-10 items-center min-h-[8rem]"
        >
          <!-- Winner side: right-aligned, content pulls toward center -->
          <div class="space-y-3 text-right min-w-0">
            <div class="space-y-1">
              {#each winningPlayers as player (player.steamId)}
                {@const icon = classIcon(player.startClass)}
                <div class="flex items-center gap-2 sm:gap-3 justify-end">
                  {#if icon}
                    <img
                      src={icon}
                      alt={player.startClass}
                      title={player.startClass}
                      class="w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9 shrink-0"
                    />
                  {/if}
                  <span
                    class="text-xl sm:text-2xl md:text-4xl font-bold text-white leading-tight break-words"
                    style={teamShadow(winnerTeam, 'name', 'bold')}
                  >
                    {player.name}
                  </span>
                </div>
              {/each}
            </div>
            {#if winnerEloDelta !== null}
              <div class="text-success-400 font-bold text-sm tabular-nums">
                {formatEloDelta(winnerEloDelta)} ELO
              </div>
            {/if}
            {#if winnerEloBefore !== null && winnerEloAfter !== null}
              <div class="text-xs font-mono text-text-muted tabular-nums">
                {winnerEloBefore} → {winnerEloAfter}
              </div>
            {/if}
          </div>

          <!-- Center: tight scoreline — the focal point of the page -->
          <div class="flex items-center gap-2 sm:gap-4 md:gap-6">
            <span
              class="text-6xl sm:text-7xl md:text-9xl font-black text-white tabular-nums leading-none tracking-tighter"
              style={teamShadow(winnerTeam, 'score', 'bold')}
            >
              {winnerScore}
            </span>
            <span
              class="text-3xl sm:text-4xl md:text-6xl text-text-muted font-light leading-none select-none"
              aria-hidden="true">—</span
            >
            <span
              class="text-6xl sm:text-7xl md:text-9xl font-black text-text-label tabular-nums leading-none tracking-tighter"
              style={teamShadow(loserTeam, 'score', 'muted')}
            >
              {loserScore}
            </span>
          </div>

          <!-- Loser side: left-aligned, content pulls toward center -->
          <div class="space-y-3 text-left min-w-0">
            <div class="space-y-1">
              {#each losingPlayers as player (player.steamId)}
                {@const icon = classIcon(player.startClass)}
                <div class="flex items-center gap-2 sm:gap-3 justify-start">
                  <span
                    class="text-xl sm:text-2xl md:text-4xl font-bold text-text-label leading-tight break-words"
                    style={teamShadow(loserTeam, 'name', 'muted')}
                  >
                    {player.name}
                  </span>
                  {#if icon}
                    <img
                      src={icon}
                      alt={player.startClass}
                      title={player.startClass}
                      class="w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9 shrink-0 opacity-80"
                    />
                  {/if}
                </div>
              {/each}
            </div>
            {#if loserEloDelta !== null}
              <div class="font-bold text-sm tabular-nums text-danger-400/70">
                {formatEloDelta(loserEloDelta)} ELO
              </div>
            {/if}
            {#if loserEloBefore !== null && loserEloAfter !== null}
              <div class="text-xs font-mono text-text-muted tabular-nums">
                {loserEloBefore} → {loserEloAfter}
              </div>
            {/if}
          </div>
        </div>
      {:else if log.aborted}
        <!-- Aborted match — no winner/loser, just a notice -->
        <div class="text-center py-6">
          <div class="text-4xl font-bold text-danger-400 mb-2">Match Aborted</div>
          <div class="text-text-muted text-sm">No final result recorded.</div>
        </div>
      {/if}

      <!-- Head-to-head comparison strip: values clustered center (mirroring the score), share-bar below -->
      {#snippet statRow(
        label: string,
        winnerVal: number,
        loserVal: number,
        winnerDisplay: string,
        loserDisplay: string,
      )}
        {@const total = winnerVal + loserVal}
        {@const winnerPct = total > 0 ? (winnerVal / total) * 100 : 50}
        {@const loserPct = total > 0 ? (loserVal / total) * 100 : 50}
        <div class="space-y-1.5">
          <div
            class="text-center text-[10px] uppercase tracking-[0.25em] text-text-muted font-bold"
          >
            {label}
          </div>
          <div class="flex items-baseline justify-center gap-3 sm:gap-4">
            <span class="font-bold text-white tabular-nums text-base md:text-lg whitespace-nowrap">
              {winnerDisplay}
            </span>
            <span class="text-text-muted text-sm select-none" aria-hidden="true">—</span>
            <span
              class="font-bold text-text-label tabular-nums text-base md:text-lg whitespace-nowrap"
            >
              {loserDisplay}
            </span>
          </div>
          <div class="h-2 bg-surface-input rounded-full overflow-hidden flex">
            <div
              class="{winnerBarClass} h-full opacity-70 transition-all"
              style="width: {winnerPct}%"
            ></div>
            <div
              class="{loserBarClass} h-full opacity-70 transition-all"
              style="width: {loserPct}%"
            ></div>
          </div>
        </div>
      {/snippet}

      {#if showComparison}
        <div class="space-y-3 pt-6 border-t border-border-default">
          {#if winnerStats.damage > 0 || loserStats.damage > 0}
            {@render statRow(
              'Damage',
              winnerStats.damage,
              loserStats.damage,
              winnerStats.damage.toLocaleString(),
              loserStats.damage.toLocaleString(),
            )}
          {/if}
          {#if winnerStats.dpm > 0 || loserStats.dpm > 0}
            {@render statRow(
              'DPM',
              winnerStats.dpm,
              loserStats.dpm,
              winnerStats.dpm.toFixed(0),
              loserStats.dpm.toFixed(0),
            )}
          {/if}
          {#if winnerStats.accuracy !== null || loserStats.accuracy !== null}
            {@render statRow(
              'Accuracy',
              winnerStats.accuracy ?? 0,
              loserStats.accuracy ?? 0,
              formatAccuracy(winnerStats.accuracy),
              formatAccuracy(loserStats.accuracy),
            )}
          {/if}
        </div>
      {/if}

      <!-- Per-player weapon table: comparison frames the page, but each side reads naturally on its own -->
      {#snippet playerWeapons(player: PlayerRecord)}
        {@const weapons = filteredWeapons(player)}
        {#if weapons.length > 0}
          <div class="space-y-1.5">
            {#if !isOneVsOne}
              <div class="flex items-center gap-2">
                {#if player.won}
                  <span class="text-warning-400 text-xs" aria-label="Winner">★</span>
                {/if}
                <span
                  class="text-xs font-bold {player.won ? 'text-white' : 'text-text-label'}"
                  >{player.name}</span
                >
                <span class="text-[10px] uppercase tracking-wider text-text-muted"
                  >{player.startClass}</span
                >
              </div>
            {/if}
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-border-default">
                  <th
                    scope="col"
                    class="text-[10px] uppercase tracking-wider text-text-muted font-bold pb-1.5 text-left"
                    >Weapon</th
                  >
                  <th
                    scope="col"
                    class="text-[10px] uppercase tracking-wider text-text-muted font-bold pb-1.5 pl-3 text-right"
                    >K</th
                  >
                  <th
                    scope="col"
                    class="text-[10px] uppercase tracking-wider text-text-muted font-bold pb-1.5 pl-3 text-right"
                    >DA</th
                  >
                  <th
                    scope="col"
                    class="text-[10px] uppercase tracking-wider text-text-muted font-bold pb-1.5 pl-3 text-right"
                    >Acc</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each weapons as [weapon, w] (weapon)}
                  {@const kPct = weaponKillsPct(player, w)}
                  {@const dPct = weaponDamagePct(player, w)}
                  <tr>
                    <td class="py-1 text-text-label font-semibold whitespace-nowrap"
                      >{formatWeaponName(weapon)}</td
                    >
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">
                      <span class="text-text-body">{w.kills}</span>
                      {#if kPct !== null}
                        <span class="text-text-muted ml-1">({kPct}%)</span>
                      {/if}
                    </td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">
                      <span class="text-text-body">{w.damage.toLocaleString()}</span>
                      {#if dPct !== null}
                        <span class="text-text-muted ml-1">({dPct}%)</span>
                      {/if}
                    </td>
                    <td
                      class="py-1 pl-3 text-right tabular-nums text-text-body whitespace-nowrap"
                      >{weaponAccuracy(w.shotsFired, w.shotsHit)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/snippet}

      {#if winnerWeaponPlayers.length > 0 || loserWeaponPlayers.length > 0}
        <div class="space-y-3">
          <div class="text-[10px] uppercase tracking-[0.2em] font-semibold text-text-muted">
            Weapons
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            <div class="space-y-4">
              {#each winnerWeaponPlayers as player (player.steamId)}
                {@render playerWeapons(player)}
              {/each}
            </div>
            <div class="space-y-4 opacity-80">
              {#each loserWeaponPlayers as player (player.steamId)}
                {@render playerWeapons(player)}
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Match flow timeline: every kill in chronological order, colored by attacker team -->
      {#if flowSegments.length > 0}
        <div class="space-y-2">
          <div class="text-[10px] uppercase tracking-[0.2em] font-semibold text-text-muted">
            Match Flow
          </div>
          <div
            class="flex h-3 rounded-full overflow-hidden border border-border-default bg-surface-input"
          >
            {#each flowSegments as seg, i (i)}
              <div
                class="flex-1 min-w-[2px] opacity-70 transition-opacity hover:opacity-100 {seg.team ===
                'Red'
                  ? 'bg-danger-500'
                  : seg.team === 'Blue'
                    ? 'bg-info-500'
                    : 'bg-zinc-600'}"
                title="{formatTimestamp(seg.timestamp)} — {seg.attacker} → {seg.victim} ({formatWeaponName(
                  seg.weapon,
                )})"
              ></div>
            {/each}
          </div>
          <div class="flex justify-between text-xs font-mono text-text-muted">
            <span>0:00</span>
            <span>{formatDuration(log.durationSec)}</span>
          </div>
        </div>
      {/if}

      <!-- Match metadata strip: forensic info, demoted to footer of hero -->
      <div
        class="flex items-center gap-x-3 gap-y-1 flex-wrap pt-4 border-t border-border-default text-xs text-text-muted"
      >
        {#if log.hostname}
          <span class="text-text-label font-medium">{log.hostname}</span>
          <span>·</span>
        {/if}
        <span>{log.map}</span>
        {#if cleanedArena}
          <span>·</span>
          <span>{cleanedArena}</span>
        {/if}
        <span>·</span>
        <span>{formatDate(log.startedAt)}</span>
        {#if log.durationSec !== null}
          <span>·</span>
          <span>{formatDuration(log.durationSec)}</span>
        {/if}
      </div>
    </div>
  </Card>

  <!-- Kill Events Timeline — collapsed by default; the match flow bar above is the at-a-glance story -->
  {#if killEvents.length > 0}
    <details class="group">
      <summary
        class="cursor-pointer list-none flex items-center justify-between gap-3 py-3 px-4 rounded-lg bg-surface-card border border-border-default hover:bg-surface-hover transition-colors"
      >
        <div class="flex items-center gap-3">
          <span
            class="text-text-muted text-sm transition-transform group-open:rotate-90"
            aria-hidden="true">▶</span
          >
          <span class="text-sm font-semibold text-white uppercase tracking-wider">Kill Events</span>
          <span class="text-xs text-text-muted font-mono">({killEvents.length})</span>
        </div>
        <span class="text-xs text-text-muted">Detailed log</span>
      </summary>
      <div class="mt-3">
        <DataTable
          data={pagedKillEvents}
          columns={killColumns}
          compact={true}
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
              <span class="font-mono text-text-muted text-xs"
                >{formatTimestamp(event.timestamp)}</span
              >
            {:else if col.key === 'killer'}
              <span class="text-text-label">{getPlayerName(event.attackerSteamId)}</span>
            {:else if col.key === 'victim'}
              <span class="text-text-label">{getPlayerName(event.victimSteamId)}</span>
            {:else if col.key === 'weapon'}
              <span class="text-text-body">{formatWeaponName(event.weapon)}</span>
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
    </details>
  {/if}

  <!-- Chat Log — collapsed by default -->
  {#if log.parsedData.chat.length > 0}
    <details class="group">
      <summary
        class="cursor-pointer list-none flex items-center justify-between gap-3 py-3 px-4 rounded-lg bg-surface-card border border-border-default hover:bg-surface-hover transition-colors"
      >
        <div class="flex items-center gap-3">
          <span
            class="text-text-muted text-sm transition-transform group-open:rotate-90"
            aria-hidden="true">▶</span
          >
          <span class="text-sm font-semibold text-white uppercase tracking-wider">Chat Log</span>
          <span class="text-xs text-text-muted font-mono">({log.parsedData.chat.length})</span>
        </div>
      </summary>
      <Card class="mt-3">
        <div class="space-y-1">
          {#each log.parsedData.chat as msg, i (i)}
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
    </details>
  {/if}
</div>
