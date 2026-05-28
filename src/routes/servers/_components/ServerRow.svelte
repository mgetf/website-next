<script lang="ts">
  import type { PublicGameServer } from '$lib/types/servers';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ServerStatusBadge from './ServerStatusBadge.svelte';
  import ConnectChip from './ConnectChip.svelte';

  let { server, last = false }: { server: PublicGameServer; last?: boolean } = $props();

  const fillPct = $derived(
    server.maxPlayers > 0 ? Math.round((server.playerCount / server.maxPlayers) * 100) : 0,
  );

  const barColor = $derived(
    fillPct >= 100 ? 'bg-danger-500' : fillPct >= 80 ? 'bg-warning-500' : 'bg-success-500/70',
  );

  const playerColor = $derived(
    fillPct >= 100
      ? 'text-danger-400'
      : fillPct >= 80
        ? 'text-warning-400'
        : fillPct > 0
          ? 'text-white'
          : 'text-text-muted',
  );
</script>

<!-- Desktop row -->
<div
  class="hidden md:grid grid-cols-[3fr_2fr_9rem_8rem_13rem] gap-x-4 items-center px-5 py-4
    {last ? '' : 'border-b border-border-default'}
    hover:bg-surface-input/20 transition-colors"
>
  <!-- Display name + ELO -->
  <div class="flex items-center gap-2 min-w-0">
    <span
      class="font-semibold text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis"
      title={server.displayName}
    >
      {server.displayName}
    </span>
    {#if server.elo}
      <Badge color="blue" class="shrink-0">ELO</Badge>
    {/if}
  </div>

  <!-- Map -->
  <div class="font-mono text-xs text-text-muted truncate" title={server.map}>
    {server.map}
  </div>

  <!-- Players + bar -->
  <div class="flex flex-col gap-1.5">
    <span class="text-xs font-medium tabular-nums {playerColor}">
      {server.playerCount}<span class="text-text-muted font-normal">/{server.maxPlayers}</span>
    </span>
    <div class="w-full h-1 rounded-full bg-surface-input overflow-hidden">
      <div
        class="h-full rounded-full transition-[width] duration-500 {barColor}"
        style="width: {fillPct}%"
        role="progressbar"
        aria-valuenow={server.playerCount}
        aria-valuemin={0}
        aria-valuemax={server.maxPlayers}
        aria-label="Players: {server.playerCount} of {server.maxPlayers}"
      ></div>
    </div>
  </div>

  <!-- Status -->
  <div>
    <ServerStatusBadge status={server.status} />
  </div>

  <!-- Connect -->
  <div class="flex justify-end">
    <ConnectChip connect={server.connect} sdrConnect={server.sdrConnect} />
  </div>
</div>

<!-- Mobile card -->
<div class="md:hidden px-4 py-4 {last ? '' : 'border-b border-border-default'}">
  <div class="flex items-start justify-between gap-3 mb-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span
          class="font-semibold text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis"
          >{server.displayName}</span
        >
        {#if server.elo}
          <Badge color="blue" class="shrink-0">ELO</Badge>
        {/if}
      </div>
      <p class="font-mono text-xs text-text-muted mt-0.5 truncate">{server.map}</p>
    </div>
    <div class="shrink-0">
      <ServerStatusBadge status={server.status} />
    </div>
  </div>

  <div class="flex flex-col gap-1 mb-3">
    <div class="flex items-center justify-between">
      <span class="text-xs text-text-muted">Players</span>
      <span class="text-xs font-medium tabular-nums {playerColor}">
        {server.playerCount}<span class="text-text-muted font-normal">/{server.maxPlayers}</span>
      </span>
    </div>
    <div class="w-full h-1.5 rounded-full bg-surface-input overflow-hidden">
      <div
        class="h-full rounded-full transition-[width] duration-500 {barColor}"
        style="width: {fillPct}%"
        role="progressbar"
        aria-valuenow={server.playerCount}
        aria-valuemin={0}
        aria-valuemax={server.maxPlayers}
        aria-label="Players: {server.playerCount} of {server.maxPlayers}"
      ></div>
    </div>
  </div>

  <ConnectChip connect={server.connect} sdrConnect={server.sdrConnect} />
</div>
