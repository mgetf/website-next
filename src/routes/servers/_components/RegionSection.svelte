<script lang="ts">
  import type { PublicGameServer } from '$lib/types/servers';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import ServerRow from './ServerRow.svelte';

  let {
    regionSlug,
    regionName,
    regionFlag,
    servers,
  }: {
    regionSlug: string;
    regionName: string;
    regionFlag?: string;
    servers: PublicGameServer[];
  } = $props();

  const activePlayers = $derived(servers.reduce((n, s) => n + s.playerCount, 0));

  const flagCode = $derived(
    regionFlag && /^[A-Za-z]{2,3}$/.test(regionFlag) ? regionFlag : regionSlug,
  );

  function formatLocationName(slug: string): string {
    return slug
      .split('-')
      .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ');
  }

  const locationGroups = $derived(() => {
    const map = new Map<string, PublicGameServer[]>();
    for (const s of servers) {
      if (!map.has(s.hostSlug)) map.set(s.hostSlug, []);
      map.get(s.hostSlug)!.push(s);
    }
    return [...map.entries()].map(([slug, svrs]) => ({
      slug,
      name: formatLocationName(slug),
      servers: svrs.sort((a, b) => a.slot - b.slot),
    }));
  });

  const multipleLocations = $derived(locationGroups().length > 1);
</script>

<section aria-labelledby="region-{regionSlug}">
  <!-- Region header -->
  <div class="flex items-center gap-3 mb-3 px-1">
    <FlagIcon code={flagCode} class="w-12 h-8 text-3xl" />
    <h2 id="region-{regionSlug}" class="text-3xl font-bold text-white leading-tight">
      {regionName}
    </h2>
    <div class="ml-auto flex items-center gap-3 text-xs text-text-muted">
      <span>
        <span class="text-text-label font-medium">{activePlayers}</span>
        {activePlayers !== 1 ? 'players' : 'player'} online
      </span>
      <span class="text-border-default">·</span>
      <span>{servers.length} {servers.length !== 1 ? 'servers' : 'server'}</span>
    </div>
  </div>

  <!-- Table card -->
  <div class="rounded-xl border border-border-default bg-surface-card overflow-hidden">
    <!-- Column headers -->
    <div
      class="hidden md:grid grid-cols-[3fr_2fr_9rem_8rem_20rem] gap-x-4 px-5 py-2.5 border-b border-border-default bg-surface-input/20"
      aria-hidden="true"
    >
      <span class="text-[11px] font-semibold text-text-muted uppercase tracking-widest">Server</span
      >
      <span class="text-[11px] font-semibold text-text-muted uppercase tracking-widest">Map</span>
      <span class="text-[11px] font-semibold text-text-muted uppercase tracking-widest"
        >Players</span
      >
      <span class="text-[11px] font-semibold text-text-muted uppercase tracking-widest">Status</span
      >
      <span class="text-[11px] font-semibold text-text-muted uppercase tracking-widest text-right"
        >Connect</span
      >
    </div>

    {#each locationGroups() as loc, li (loc.slug)}
      {#if multipleLocations}
        <div
          class="px-5 py-2 {li > 0
            ? 'border-t border-border-default'
            : ''} bg-surface-input/10 flex items-center gap-2"
        >
          <span class="text-xs font-semibold text-text-muted uppercase tracking-widest"
            >{loc.name}</span
          >
          <span class="text-border-default text-xs">·</span>
          <span class="text-xs text-text-muted"
            >{loc.servers.length} {loc.servers.length !== 1 ? 'servers' : 'server'}</span
          >
        </div>
      {/if}
      {#each loc.servers as server, i (server.connect)}
        <ServerRow
          {server}
          last={!multipleLocations
            ? li === locationGroups().length - 1 && i === loc.servers.length - 1
            : i === loc.servers.length - 1 && li === locationGroups().length - 1}
        />
      {/each}
    {/each}
  </div>
</section>
