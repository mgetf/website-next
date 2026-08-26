<script lang="ts">
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';

  function regionToFlagCode(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('eu') || n.includes('europe')) return 'eu';
    if (n.includes('na') || n.includes('north america') || n === 'us') return 'us';
    if (n.includes('as') || n.includes('asia')) return 'sg';
    if (n.includes('au') || n.includes('oceania')) return 'au';
    if (/^[a-z]{2}$/.test(n)) return n;
    return '';
  }

  interface EloEntry {
    elo: number;
    steamId64: string;
    isRegistered: boolean;
    name: string | null;
    avatar: string | null;
  }

  interface EloRegion {
    region: string;
    entries: EloEntry[];
  }

  interface Team2v2 {
    rank: number;
    name: string;
    avatar: string | null;
    record: string;
    points: number;
    id: number;
  }

  interface Entry1v1 {
    rank: number;
    id: number;
    name: string;
    avatar: string | null;
    steamId: string | null;
    record: string;
    points: number;
  }

  interface League2v2Region {
    regionName: string;
    season: string;
    signupsOpen: boolean;
    topTeams: Team2v2[];
  }

  interface League1v1Region {
    regionName: string;
    season: string;
    signupsOpen: boolean;
    topEntries: Entry1v1[];
  }

  interface PageData {
    user: any;
    eloLeaderboard: EloRegion[];
    leaderboard2v2: League2v2Region[];
    leaderboard1v1: League1v1Region[];
    anySignupsOpen2v2: boolean;
    anySignupsOpen1v1: boolean;
    siteContent: { subtitle: string; about: string };
  }

  let { data } = $props<{ data: PageData }>();

  const eloLeaderboard = $derived(data.eloLeaderboard ?? []);
  const leaderboard2v2 = $derived(data.leaderboard2v2 ?? []);
  const leaderboard1v1 = $derived(data.leaderboard1v1 ?? []);
  const siteContent = $derived(data.siteContent ?? { subtitle: '', about: '' });
  const signupHref = $derived(data.user ? '/signup' : '/auth/login?redirect=%2Fsignup');
  const showEloLeaderboard = $derived(eloLeaderboard.length > 0);
</script>

<div class="min-h-screen">
  <!-- Hero Section -->
  <section class="relative py-20 px-6 text-center">
    <div class="max-w-4xl mx-auto">
      <h1 class="flex items-center justify-center gap-4 mb-6">
        <img src="/mge_transparent_logo.png" alt="MGE Logo" class="h-24 w-auto" />
        <span class="text-7xl font-black text-white drop-shadow-2xl">MGE</span>
      </h1>
      <p class="text-xl text-text-label max-w-2xl mx-auto leading-relaxed font-medium">
        {siteContent.subtitle}
      </p>
    </div>
  </section>

  <!-- MGE ELO Leaderboard -->
  {#if showEloLeaderboard}
    <section class="max-w-7xl mx-auto px-4 sm:px-6 mb-10 sm:mb-14">
      <!-- Section header -->
      <div class="mb-5 sm:mb-6 text-center">
        <h2 class="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight mb-1">
          MGE <span class="text-primary-400">ELO</span> Rankings
        </h2>
        <p class="text-text-muted text-sm">Live standings from all active regions</p>
      </div>

      <div
        class="flex sm:grid gap-4 sm:gap-5 overflow-x-auto sm:overflow-visible snap-x sm:snap-none snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]"
      >
        {#each eloLeaderboard as regionData (regionData.region)}
          {@const fc = regionToFlagCode(regionData.region)}
          <div
            class="relative snap-center shrink-0 w-[min(calc(100vw-2rem),22.5rem)] sm:w-auto sm:shrink rounded-xl border border-primary-500/20 bg-surface-card overflow-hidden shadow-xl shadow-primary-500/5"
          >
            <!-- Subtle top glow strip -->
            <div
              class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-400/60 to-transparent"
            ></div>

            <!-- Region header -->
            <div
              class="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-border-default/50"
            >
              <div class="flex items-center gap-2">
                {#if fc}<FlagIcon code={fc} class="w-6 h-4 rounded-sm" />{/if}
                <span class="text-sm font-bold uppercase tracking-widest text-white">
                  {regionData.region.toUpperCase()}
                </span>
              </div>
              <span
                class="text-[10px] font-bold uppercase tracking-widest text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-full px-2 py-0.5"
              >
                Live
              </span>
            </div>

            <!-- Players -->
            <div class="px-3 sm:px-5 py-3 sm:py-4 space-y-0.5 sm:space-y-1">
              {#each regionData.entries as entry, i (entry.steamId64)}
                {@const medalSymbols = ['🥇', '🥈', '🥉']}
                {@const isFirst = i === 0}
                {@const isMedal = i < 3 && !isFirst}
                {@const isCompact = i >= 3}
                <div
                  class="flex items-center gap-2.5 sm:gap-3 rounded-lg transition-colors {isFirst
                    ? 'px-2.5 sm:px-3 py-2 sm:py-2.5 bg-primary-500/8 border border-primary-500/15'
                    : isMedal
                      ? 'px-2.5 sm:px-3 py-2 sm:py-2.5 hover:bg-surface-hover'
                      : 'px-2.5 sm:px-3 py-1.5 sm:py-1 hover:bg-surface-hover'}"
                >
                  <span class="shrink-0 w-6 text-center" aria-hidden="true">
                    {#if isCompact}
                      <span class="text-xs text-text-muted font-mono">#{i + 1}</span>
                    {:else}
                      <span class="text-base">{medalSymbols[i]}</span>
                    {/if}
                  </span>
                  {#if entry.avatar}
                    <img
                      src={entry.avatar}
                      alt={entry.name ?? 'Player'}
                      class="rounded-full shrink-0 {isFirst
                        ? 'w-9 h-9'
                        : isMedal
                          ? 'w-7 h-7'
                          : 'w-5 h-5'}"
                    />
                  {:else}
                    <div
                      class="rounded-full bg-surface-input shrink-0 flex items-center justify-center {isFirst
                        ? 'w-9 h-9'
                        : isMedal
                          ? 'w-7 h-7'
                          : 'w-5 h-5'}"
                    >
                      <svg
                        class="w-4 h-4 text-text-muted"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                        />
                      </svg>
                    </div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <a
                      href="/users/{entry.steamId64}"
                      class="block truncate hover:text-primary-400 transition-colors {isFirst
                        ? 'font-semibold text-white text-base'
                        : isMedal
                          ? 'font-semibold text-text-label text-sm'
                          : 'font-medium text-text-muted text-xs'}"
                    >
                      {entry.name ?? 'Unknown Player'}
                    </a>
                  </div>
                  <span
                    class="tabular-nums shrink-0 {isFirst
                      ? 'font-black text-primary-400 text-xl'
                      : isMedal
                        ? 'font-black text-primary-500 text-base'
                        : 'font-semibold text-primary-600 text-sm'}"
                  >
                    {entry.elo}
                  </span>
                </div>
              {/each}
            </div>

            <div class="px-4 sm:px-5 pb-3 sm:pb-4">
              <a
                href="/leaderboard?region={regionData.region}"
                class="inline-flex items-center min-h-10 text-xs text-text-muted hover:text-primary-400 transition-colors font-medium"
              >
                View full leaderboard →
              </a>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- League Standings -->
  {#if leaderboard2v2.length > 0 || leaderboard1v1.length > 0}
    <section class="max-w-7xl mx-auto px-6 mb-16 space-y-8">
      <!-- 2v2 League -->
      {#if leaderboard2v2.length > 0}
        <div>
          <div class="mb-3 flex items-center gap-3">
            <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-format-2v2-400/70">
              2v2 League
            </h2>
            <div class="flex-1 h-px bg-format-2v2-500/20"></div>
            <a
              href="/leagues/2v2"
              class="text-xs text-text-muted hover:text-text-label transition-colors font-medium shrink-0"
            >
              View Full Standings →
            </a>
          </div>
          <div
            class="grid gap-4"
            style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));"
          >
            {#each leaderboard2v2 as region (region.regionName)}
              {@const fc = regionToFlagCode(region.regionName)}
              <Card padding="none" class="overflow-hidden">
                <div class="h-1 bg-format-2v2-500"></div>
                <div class="p-5">
                  <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                      {#if fc}<FlagIcon code={fc} class="w-5 h-3.5 rounded-sm" />{/if}
                      <span class="text-xs font-bold uppercase tracking-widest text-text-muted">
                        {region.regionName}
                      </span>
                    </div>
                    <span class="text-xs text-text-muted">{region.season}</span>
                  </div>
                  {#if region.signupsOpen}
                    <div class="py-3 text-center">
                      <span class="text-format-2v2-400 text-sm font-bold block mb-1"
                        >Signups Open!</span
                      >
                      <a
                        href={signupHref}
                        class="text-xs text-text-muted hover:text-format-2v2-400 transition-colors"
                      >
                        Register your team →
                      </a>
                    </div>
                  {:else if region.topTeams.length > 0}
                    <div class="space-y-2">
                      {#each region.topTeams as team (team.id)}
                        <a
                          href="/teams/{team.id}"
                          class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-colors"
                        >
                          <div class="flex items-center gap-2 min-w-0">
                            <span class="text-text-muted font-mono text-xs w-4 shrink-0"
                              >#{team.rank}</span
                            >
                            {#if team.avatar}
                              <img
                                src={team.avatar}
                                alt={team.name}
                                class="w-5 h-5 rounded shrink-0"
                              />
                            {:else}
                              <div class="w-5 h-5 rounded bg-surface-input shrink-0"></div>
                            {/if}
                            <span class="text-white font-medium text-sm truncate">{team.name}</span>
                          </div>
                          <span class="text-xs text-text-body tabular-nums shrink-0 ml-2"
                            >{team.record}</span
                          >
                        </a>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-center py-3 text-text-muted text-xs">No standings yet</div>
                  {/if}
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 1v1 League -->
      {#if leaderboard1v1.length > 0}
        <div>
          <div class="mb-3 flex items-center gap-3">
            <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-format-1v1-400/70">
              1v1 League
            </h2>
            <div class="flex-1 h-px bg-format-1v1-500/20"></div>
            <a
              href="/leagues/1v1"
              class="text-xs text-text-muted hover:text-text-label transition-colors font-medium shrink-0"
            >
              View Full Standings →
            </a>
          </div>
          <div
            class="grid gap-4"
            style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));"
          >
            {#each leaderboard1v1 as region (region.regionName)}
              {@const fc = regionToFlagCode(region.regionName)}
              <Card padding="none" class="overflow-hidden">
                <div class="h-1 bg-format-1v1-500"></div>
                <div class="p-5">
                  <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                      {#if fc}<FlagIcon code={fc} class="w-5 h-3.5 rounded-sm" />{/if}
                      <span class="text-xs font-bold uppercase tracking-widest text-text-muted">
                        {region.regionName}
                      </span>
                    </div>
                    <span class="text-xs text-text-muted">{region.season}</span>
                  </div>
                  {#if region.signupsOpen}
                    <div class="py-3 text-center">
                      <span class="text-format-1v1-400 text-sm font-bold block mb-1"
                        >Signups Open!</span
                      >
                      <a
                        href={signupHref}
                        class="text-xs text-text-muted hover:text-format-1v1-400 transition-colors"
                      >
                        Sign up now →
                      </a>
                    </div>
                  {:else if region.topEntries.length > 0}
                    <div class="space-y-2">
                      {#each region.topEntries as entry (entry.id)}
                        <a
                          href={entry.steamId ? `/users/${entry.steamId}` : `/leagues/1v1`}
                          class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-colors"
                        >
                          <div class="flex items-center gap-2 min-w-0">
                            <span class="text-text-muted font-mono text-xs w-4 shrink-0"
                              >#{entry.rank}</span
                            >
                            {#if entry.avatar}
                              <img
                                src={entry.avatar}
                                alt={entry.name}
                                class="w-5 h-5 rounded-full shrink-0"
                              />
                            {/if}
                            <span class="text-white font-medium text-sm truncate">{entry.name}</span
                            >
                          </div>
                          <span class="text-xs text-text-body tabular-nums shrink-0 ml-2"
                            >{entry.record}</span
                          >
                        </a>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-center py-3 text-text-muted text-xs">No standings yet</div>
                  {/if}
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Signup CTAs (only shown when signups are open) -->
  {#if data.anySignupsOpen2v2 || data.anySignupsOpen1v1}
    <section class="max-w-7xl mx-auto px-6 mb-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        {#if data.anySignupsOpen2v2}
          <div
            class="rounded-xl border-2 border-format-2v2-400 shadow-2xl shadow-format-2v2-500/25 flex flex-col overflow-hidden"
          >
            <div class="h-1.5 w-full bg-format-2v2-400"></div>
            <div class="bg-surface-card p-8 flex flex-col flex-grow">
              <p class="text-format-2v2-400 text-sm font-bold tracking-widest uppercase mb-6">
                2v2 League
              </p>
              <div class="flex-grow flex flex-col justify-center mb-8">
                <p class="text-5xl font-black text-white uppercase leading-none mb-2">Signups</p>
                <p class="text-5xl font-black text-format-2v2-400 uppercase leading-none mb-6">
                  Are Open.
                </p>
                <p class="text-text-body text-base leading-relaxed">
                  New season, new teams. Get registered before it fills up!
                </p>
              </div>
              <a
                href={signupHref}
                class="block w-full py-5 px-6 bg-format-2v2-500 hover:bg-format-2v2-400 text-white font-black text-xl rounded-xl text-center transition-all shadow-lg shadow-format-2v2-500/40 hover:shadow-format-2v2-400/60"
              >
                Register Your Team →
              </a>
            </div>
          </div>
        {/if}
        {#if data.anySignupsOpen1v1}
          <div
            class="rounded-xl border-2 border-format-1v1-400 shadow-2xl shadow-format-1v1-500/25 flex flex-col overflow-hidden"
          >
            <div class="h-1.5 w-full bg-format-1v1-400"></div>
            <div class="bg-surface-card p-8 flex flex-col flex-grow">
              <p class="text-format-1v1-400 text-sm font-bold tracking-widest uppercase mb-6">
                1v1 League
              </p>
              <div class="flex-grow flex flex-col justify-center mb-8">
                <p class="text-5xl font-black text-white uppercase leading-none mb-2">Signups</p>
                <p class="text-5xl font-black text-format-1v1-400 uppercase leading-none mb-6">
                  Are Open.
                </p>
                <p class="text-text-body text-base leading-relaxed">
                  New season starting soon. Get your name on the list!
                </p>
              </div>
              <a
                href={signupHref}
                class="block w-full py-5 px-6 bg-format-1v1-600 hover:bg-format-1v1-500 text-white font-black text-xl rounded-xl text-center transition-all shadow-lg shadow-format-1v1-500/40 hover:shadow-format-1v1-500/60"
              >
                Sign Up Now →
              </a>
            </div>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- What is MGE? Section -->
  <section class="max-w-6xl mx-auto px-6 pb-20">
    <div class="bg-surface-card rounded-xl p-12 border-2 border-border-default shadow-2xl">
      <div class="max-w-4xl mx-auto">
        <MarkdownRenderer content={siteContent.about} />
      </div>
    </div>
  </section>
</div>
