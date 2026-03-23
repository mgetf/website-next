<script lang="ts">
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';

  interface PageData {
    user: any;
    league2v2Data: {
      season: string;
      signupsOpen: boolean;
      topTeams: Array<{
        rank: number;
        name: string;
        record: string;
        points: number;
        id: number;
      }>;
    };
    league1v1Data: {
      season: string;
      signupsOpen: boolean;
      topEntries: Array<{
        rank: number;
        id: number;
        name: string;
        avatar: string | null;
        steamId: string | null;
        record: string;
        points: number;
      }>;
    };
    siteContent: {
      subtitle: string;
      about: string;
    };
  }

  let { data } = $props<{ data: PageData }>();

  const league2v2Data = $derived(
    data.league2v2Data || { season: 'Season 1', signupsOpen: false, topTeams: [] },
  );
  const league1v1Data = $derived(
    data.league1v1Data || { season: 'Season 1', signupsOpen: false, topEntries: [] },
  );
  const siteContent = $derived(data.siteContent || { subtitle: '', about: '' });
  const signupHref = $derived(data.user ? '/signup' : '/auth/login?redirect=%2Fsignup');
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

  <!-- Competition Cards -->
  <section class="max-w-7xl mx-auto px-6 mb-16">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- 2v2 League Card -->
      {#if league2v2Data.signupsOpen}
        <div
          class="rounded-xl border-2 border-blue-400 shadow-2xl shadow-blue-500/25 flex flex-col overflow-hidden"
        >
          <div class="h-1.5 w-full bg-blue-400"></div>
          <div class="bg-surface-card p-8 flex flex-col flex-grow">
            <p class="text-primary-400 text-sm font-bold tracking-widest uppercase mb-6">
              2v2 League &mdash; {league2v2Data.season}
            </p>
            <div class="flex-grow flex flex-col justify-center mb-8">
              <p class="text-5xl font-black text-white uppercase leading-none mb-2">Signups</p>
              <p class="text-5xl font-black text-primary-400 uppercase leading-none mb-6">
                Are Open.
              </p>
              <p class="text-text-body text-base leading-relaxed">
                New season, new teams. Get registered before it fills up.
              </p>
            </div>
            <a
              href={signupHref}
              class="block w-full py-5 px-6 bg-format-2v2-500 hover:bg-format-2v2-400 text-white font-black text-xl rounded-xl text-center transition-all shadow-lg shadow-format-2v2-500/40 hover:shadow-format-2v2-400/60 mb-3"
            >
              Register Your Team →
            </a>
            <a
              href="/leagues/2v2"
              class="block w-full py-2.5 px-4 text-text-muted hover:text-text-label font-medium text-sm rounded-lg text-center transition-colors"
            >
              View Standings
            </a>
          </div>
        </div>
      {:else}
        <div
          class="bg-surface-card rounded-xl p-8 border-2 border-primary-500 hover:border-blue-400 transition-all shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 flex flex-col"
        >
          <div class="mb-4">
            <h3 class="text-2xl font-bold text-primary-400">2v2 LEAGUE</h3>
          </div>
          <div class="mb-6">
            <p class="text-text-body text-sm mb-2">Current Season</p>
            <p class="text-xl font-semibold text-white">{league2v2Data.season}</p>
          </div>
          <div class="mb-6">
            <p class="text-text-body text-sm mb-3">Premier Division Top 3</p>
            <div class="space-y-2">
              {#if league2v2Data.topTeams.length > 0}
                {#each league2v2Data.topTeams as team}
                  <a
                    href="/teams/{team.id}"
                    class="flex items-center justify-between bg-surface-input/50 rounded p-2 hover:bg-surface-hover transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-text-body font-mono w-6">#{team.rank}</span>
                      <span class="text-white font-medium">{team.name}</span>
                    </div>
                    <div class="text-right">
                      <div class="text-sm text-text-body">{team.record}</div>
                      <div class="text-xs text-text-muted">{team.points} ppg</div>
                    </div>
                  </a>
                {/each}
              {:else}
                <div class="text-center py-4 text-text-muted">No teams yet this season</div>
              {/if}
            </div>
          </div>
          <a
            href="/leagues/2v2"
            class="block w-full py-3 px-4 bg-format-2v2-600 hover:bg-format-2v2-700 text-white font-semibold rounded-lg text-center transition-colors mt-auto"
          >
            View Full Standings →
          </a>
        </div>
      {/if}

      <!-- 1v1 League Card -->
      {#if league1v1Data.signupsOpen}
        <div
          class="rounded-xl border-2 border-purple-400 shadow-2xl shadow-purple-500/25 flex flex-col overflow-hidden"
        >
          <div class="h-1.5 w-full bg-purple-400"></div>
          <div class="bg-surface-card p-8 flex flex-col flex-grow">
            <p class="text-purple-400 text-sm font-bold tracking-widest uppercase mb-6">
              1v1 League &mdash; {league1v1Data.season}
            </p>
            <div class="flex-grow flex flex-col justify-center mb-8">
              <p class="text-5xl font-black text-white uppercase leading-none mb-2">Signups</p>
              <p class="text-5xl font-black text-purple-400 uppercase leading-none mb-6">
                Are Open.
              </p>
              <p class="text-text-body text-base leading-relaxed">
                New season starting soon. Get your name on the list.
              </p>
            </div>
            <a
              href={signupHref}
              class="block w-full py-5 px-6 bg-format-1v1-600 hover:bg-format-1v1-500 text-white font-black text-xl rounded-xl text-center transition-all shadow-lg shadow-format-1v1-500/40 hover:shadow-format-1v1-500/60 mb-3"
            >
              Sign Up Now →
            </a>
            <a
              href="/leagues/1v1"
              class="block w-full py-2.5 px-4 text-text-muted hover:text-text-label font-medium text-sm rounded-lg text-center transition-colors"
            >
              View Standings
            </a>
          </div>
        </div>
      {:else}
        <div
          class="bg-surface-card rounded-xl p-8 border-2 border-purple-500 hover:border-purple-400 transition-all shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 flex flex-col"
        >
          <div class="mb-4">
            <h3 class="text-2xl font-bold text-purple-400">1v1 LEAGUE</h3>
          </div>
          <div class="mb-6">
            <p class="text-text-body text-sm mb-2">Current Season</p>
            <p class="text-xl font-semibold text-white">{league1v1Data.season}</p>
          </div>
          <div class="mb-6">
            <p class="text-text-body text-sm mb-3">Premier Division Top 3</p>
            <div class="space-y-2">
              {#if league1v1Data.topEntries.length > 0}
                {#each league1v1Data.topEntries as entry}
                  <a
                    href={entry.steamId ? `/users/${entry.steamId}` : `/leagues/1v1`}
                    class="flex items-center justify-between bg-surface-input/50 rounded p-2 hover:bg-surface-hover transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-text-body font-mono w-6">#{entry.rank}</span>
                      {#if entry.avatar}
                        <img src={entry.avatar} alt={entry.name} class="w-6 h-6 rounded-full" />
                      {/if}
                      <span class="text-white font-medium">{entry.name}</span>
                    </div>
                    <div class="text-right">
                      <div class="text-sm text-text-body">{entry.record}</div>
                      <div class="text-xs text-text-muted">{entry.points} ppg</div>
                    </div>
                  </a>
                {/each}
              {:else}
                <div class="text-center py-4 text-text-muted">No players yet this season</div>
              {/if}
            </div>
          </div>
          <a
            href="/leagues/1v1"
            class="block w-full py-3 px-4 bg-format-1v1-600 hover:bg-format-1v1-500 text-white font-semibold rounded-lg text-center transition-all shadow-lg hover:shadow-format-1v1-500/30 mt-auto"
          >
            View Full Standings →
          </a>
        </div>
      {/if}
    </div>
  </section>

  <!-- What is MGE? Section -->
  <section class="max-w-6xl mx-auto px-6 pb-20">
    <div class="bg-surface-card rounded-xl p-12 border-2 border-border-default shadow-2xl">
      <div class="max-w-4xl mx-auto">
        <MarkdownRenderer content={siteContent.about} />
      </div>
    </div>
  </section>
</div>
