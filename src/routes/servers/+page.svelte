<script lang="ts">
  import type { PageData } from './$types';
  import type { PublicGameServer } from '$lib/types/servers';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import RegionSection from './_components/RegionSection.svelte';

  let { data }: { data: PageData } = $props();

  // ── Live data ─────────────────────────────────────────────────────────────

  let servers = $state<PublicGameServer[]>([]);
  let generatedAt = $state('');
  let fetchError = $state<string | null>(null);
  let refreshing = $state(false);

  $effect(() => {
    servers = data.servers;
    generatedAt = data.generatedAt;
    fetchError = data.error ?? null;
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalActivePlayers = $derived(servers.reduce((n, s) => n + s.playerCount, 0));

  const groupedByRegion = $derived(() => {
    const sorted = [...servers].sort((a, b) => {
      const r = a.regionName.localeCompare(b.regionName);
      return r !== 0 ? r : a.slot - b.slot;
    });
    const map = new Map<
      string,
      { regionName: string; regionFlag?: string; servers: PublicGameServer[] }
    >();
    for (const s of sorted) {
      if (!map.has(s.regionSlug)) {
        map.set(s.regionSlug, { regionName: s.regionName, regionFlag: s.regionFlag, servers: [] });
      }
      map.get(s.regionSlug)!.servers.push(s);
    }
    return [...map.entries()].map(([slug, v]) => ({ slug, ...v }));
  });

  // ── Relative timestamp ────────────────────────────────────────────────────

  let relativeAge = $state('');

  function computeAge(iso: string): string {
    if (!iso) return '';
    const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diff < 60) return `${diff}s ago`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  $effect(() => {
    relativeAge = computeAge(generatedAt);
    const t = setInterval(() => {
      relativeAge = computeAge(generatedAt);
    }, 1000);
    return () => clearInterval(t);
  });

  // ── Live refresh (30s, pause when hidden) ────────────────────────────────

  $effect(() => {
    if (typeof document === 'undefined') return;

    const tick = async () => {
      if (document.hidden) return;
      refreshing = true;
      try {
        const r = await fetch('/api/servers', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        servers = j.servers;
        generatedAt = j.generatedAt;
        fetchError = j.error ?? null;
      } catch {
        // keep last snapshot intact
      } finally {
        refreshing = false;
      }
    };

    const timer = setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  });
</script>

<PageHero border maxWidth="max-w-7xl">
  {#snippet children()}
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 class="text-5xl font-black text-white mb-2">Servers</h1>
        <p class="text-xl text-text-body">
          {data.count}
          {data.count !== 1 ? 'servers' : 'server'} &nbsp;·&nbsp;
          <span class="text-white font-semibold">{totalActivePlayers}</span>
          {totalActivePlayers !== 1 ? 'players' : 'player'} online
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm text-text-muted pb-1">
        {#if refreshing}
          <span class="w-2 h-2 rounded-full bg-primary-400 animate-pulse" aria-hidden="true"></span>
          <span>Refreshing…</span>
        {:else if relativeAge}
          <span class="w-2 h-2 rounded-full bg-success-500/70" aria-hidden="true"></span>
          <span>Updated {relativeAge}</span>
        {/if}
      </div>
    </div>
  {/snippet}
</PageHero>

<div class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
  <!-- Error banner -->
  {#if fetchError}
    <div
      class="mb-6 px-4 py-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm"
      role="alert"
    >
      <span class="font-semibold">Warning: </span>{fetchError}
    </div>
  {/if}

  <!-- Regions -->
  {#if servers.length === 0}
    <Card class="text-center py-16">
      <p class="text-text-label font-medium mb-1">No servers available</p>
      <p class="text-text-muted text-sm">
        The server panel is currently unreachable. Please try again shortly.
      </p>
    </Card>
  {:else}
    <div class="space-y-10">
      {#each groupedByRegion() as region (region.slug)}
        <RegionSection
          regionSlug={region.slug}
          regionName={region.regionName}
          regionFlag={region.regionFlag}
          servers={region.servers}
        />
      {/each}
    </div>
  {/if}

  <!-- CTA -->
  <div
    class="mt-14 rounded-xl border border-border-default bg-surface-card px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-6"
  >
    <div>
      <p class="text-white font-semibold text-lg mb-1">Experiencing performance issues?</p>
      <p class="text-text-body text-sm">
        If any of our servers feel laggy or broken, let us know and we'll look into it.
      </p>
    </div>
    <Button variant="secondary" href="https://mge.tf/discord" class="shrink-0">
      Open a ticket on Discord
    </Button>
  </div>
</div>
