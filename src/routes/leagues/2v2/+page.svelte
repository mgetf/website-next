<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  const standingsColumns = [
    { key: 'team', label: 'Team' },
    { key: 'record', label: 'Record' },
    { key: 'points', label: 'Avg Points' },
  ];

  let activeTab = $state<'standings' | 'info'>('standings');
  let isEditing = $state(false);
  let showPreview = $state(false);
  let editContent = $state('');
  interface PageData {
    user: any;
    seasons: Array<{
      id: number;
      name: string;
      seasonNum: number;
      regionId: number;
    }>;
    regions: Array<{ id: number; name: string }>;
    selectedSeasonId: number;
    selectedRegionId: number;
    selectedRegionName: string;
    selectedSeasonNum: number;
    teamsByDivision: Array<{
      division: { id: number; name: string };
      teams: Array<{
        id: number;
        name: string;
        avatar?: string | null;
        wins: number;
        losses: number;
        points: number;
        status: string;
        isWithdrawn?: boolean;
      }>;
    }>;
    staffByDivision: Array<{
      division: { id: number; name: string };
      staff: Array<{
        steamId: string;
        name: string;
        avatar: string | null;
        role: string;
      }>;
    }>;
    deadlines: {
      signupClosed: boolean;
      rosterLocked: boolean;
      paymentRequired: boolean;
    };
    userAlreadySignedUp: boolean;
    seasonInfo: string | null;
    isAdmin: boolean;
  }

  let { data } = $props<{ data: PageData }>();

  const signupHref = $derived(data.user ? '/signup' : '/auth/login?redirect=%2Fsignup');

  const canSignUp = $derived(
    !data.deadlines.signupClosed &&
      !data.userAlreadySignedUp &&
      data.user &&
      data.user.banStatus !== 'SUSPENDED' &&
      data.user.banStatus !== 'BANNED',
  );

  let selectedSeason = $state(0);
  let selectedRegion = $state(0);
  let isInitialized = $state(false);

  $effect(() => {
    selectedSeason = data.selectedSeasonId;
    selectedRegion = data.selectedRegionId;
  });

  const regionsWithSeasons = $derived(
    data.regions.filter((region: (typeof data.regions)[number]) =>
      data.seasons.some((s: (typeof data.seasons)[number]) => s.regionId === region.id),
    ),
  );

  function teamRowClass(team: PageData['teamsByDivision'][0]['teams'][0]): string {
    if (team.isWithdrawn) return 'shadow-[inset_4px_0_0_0_var(--color-text-muted)]';
    if (team.status === 'READY') return 'shadow-[inset_4px_0_0_0_var(--color-success-500)]';
    if (team.status === 'PENDING') return 'shadow-[inset_4px_0_0_0_var(--color-warning-500)]';
    if (team.status === 'UNREADY') return 'shadow-[inset_4px_0_0_0_var(--color-danger-500)]';
    if (team.status === 'PLACEMENT') return 'shadow-[inset_4px_0_0_0_var(--color-info-500)]';
    return '';
  }

  $effect(() => {
    const seasonsForRegion = data.seasons.filter(
      (s: (typeof data.seasons)[number]) => s.regionId === selectedRegion,
    );
    if (!seasonsForRegion.find((s: (typeof data.seasons)[number]) => s.id === selectedSeason)) {
      selectedSeason = seasonsForRegion[0]?.id || data.selectedSeasonId;
    }
  });

  $effect(() => {
    if (!isInitialized) {
      isInitialized = true;
      return;
    }

    const params = new URLSearchParams();
    params.set('season', selectedSeason.toString());
    params.set('region', selectedRegion.toString());
    goto(`?${params.toString()}`, { keepFocus: true, replaceState: false });
  });

  function getRegionAbbr(regionId: number): string {
    const region = data.regions.find((r: (typeof data.regions)[number]) => r.id === regionId);
    if (!region) return 'NA';
    if (region.name.toLowerCase().includes('north america')) return 'NA';
    if (region.name.toLowerCase().includes('europe')) return 'EU';
    if (region.name.toLowerCase().includes('south america')) return 'SA';
    if (region.name.toLowerCase().includes('australia')) return 'AUS';
    if (region.name.toLowerCase().includes('asia')) return 'ASIA';
    return region.name.substring(0, 3).toUpperCase();
  }
</script>

<div class="min-h-screen pb-16">
  <!-- Hero Header -->
  <PageHero maxWidth="max-w-7xl" class="pt-12 pb-6 text-center">
    <h1 class="text-6xl font-black mb-8 text-white drop-shadow-2xl">2v2 MGE League</h1>

    {#if data.seasons.length === 0}
      <p class="text-text-body text-lg">No 2v2 seasons have been created yet.</p>
    {:else}
      <!-- Region & Season Controls -->
      <div class="flex items-start justify-center gap-8">
        <div class="flex flex-col items-center gap-2">
          <span class="text-sm font-medium text-text-body">Region</span>
          <div class="flex gap-2">
            {#each regionsWithSeasons as region}
              <button
                onclick={() => {
                  selectedRegion = region.id;
                }}
                class="px-6 py-2 rounded font-medium transition-all {selectedRegion === region.id
                  ? 'bg-surface-hover text-white border border-zinc-600'
                  : 'bg-surface-card text-text-label hover:bg-surface-input border border-border-default'}"
              >
                {getRegionAbbr(region.id)}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex flex-col items-center gap-2">
          <span class="text-sm font-medium text-text-body">Season</span>
          <select
            bind:value={selectedSeason}
            class="px-6 py-2 bg-surface-card text-white rounded border border-border-default hover:bg-surface-input transition-all cursor-pointer"
          >
            {#each data.seasons.filter((s: (typeof data.seasons)[number]) => s.regionId === selectedRegion) as season}
              <option value={season.id}>{season.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Tabs -->
      <div class="inline-flex items-center gap-1 mt-8 bg-surface-card/60 rounded-lg p-1">
        <button
          onclick={() => (activeTab = 'standings')}
          class="px-5 py-2 rounded-md text-sm font-semibold transition-all {activeTab ===
          'standings'
            ? 'bg-surface-hover text-white shadow-sm'
            : 'text-text-body hover:text-white hover:bg-surface-input/50'}"
        >
          Standings
        </button>
        <button
          onclick={() => (activeTab = 'info')}
          class="px-5 py-2 rounded-md text-sm font-semibold transition-all {activeTab === 'info'
            ? 'bg-surface-hover text-white shadow-sm'
            : 'text-text-body hover:text-white hover:bg-surface-input/50'}"
        >
          Season Info
        </button>
      </div>
    {/if}
  </PageHero>

  {#if activeTab === 'info'}
    <div class="max-w-4xl mx-auto px-6 py-4">
      {#if isEditing}
        <form
          method="POST"
          action="?/updateSeasonInfo"
          use:enhance={() => {
            return async ({ update }) => {
              await update({ reset: false });
              isEditing = false;
              showPreview = false;
            };
          }}
        >
          <input type="hidden" name="seasonId" value={data.selectedSeasonId} />
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
          >
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-page/50"
            >
              <div class="flex items-center gap-1 bg-surface-input/60 rounded-md p-1">
                <button
                  type="button"
                  onclick={() => (showPreview = false)}
                  class="px-3 py-1 rounded text-xs font-semibold transition-all {!showPreview
                    ? 'bg-surface-hover text-white'
                    : 'text-text-body hover:text-white'}">Edit</button
                >
                <button
                  type="button"
                  onclick={() => (showPreview = true)}
                  class="px-3 py-1 rounded text-xs font-semibold transition-all {showPreview
                    ? 'bg-surface-hover text-white'
                    : 'text-text-body hover:text-white'}">Preview</button
                >
              </div>
              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onclick={() => {
                    isEditing = false;
                    showPreview = false;
                  }}>Cancel</Button
                >
                <Button type="submit" variant="primary" size="sm">Save</Button>
              </div>
            </div>
            {#if showPreview}
              <div class="p-8 min-h-64">
                {#if editContent.trim()}
                  <MarkdownRenderer content={editContent} />
                {:else}
                  <p class="text-text-muted text-sm italic">Nothing to preview.</p>
                {/if}
              </div>
            {:else}
              <textarea
                name="info"
                bind:value={editContent}
                rows="24"
                placeholder="Write season info using Markdown...&#10;&#10;## Key Dates&#10;| Event | Date |&#10;|---|---|&#10;&#10;### Weekly Arena Schedule&#10;..."
                class="w-full bg-transparent text-white text-sm font-mono p-6 resize-none outline-none placeholder-text-muted leading-relaxed"
              ></textarea>
            {/if}
          </div>
        </form>
      {:else}
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          {#if data.isAdmin}
            <div
              class="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-page/50"
            >
              <span class="text-xs text-text-muted">Markdown supported</span>
              <Button
                variant="secondary"
                size="sm"
                onclick={() => {
                  editContent = data.seasonInfo ?? '';
                  isEditing = true;
                  showPreview = false;
                }}>Edit</Button
              >
            </div>
          {/if}
          <div class="p-8">
            {#if data.seasonInfo}
              <MarkdownRenderer content={data.seasonInfo} />
            {:else if data.isAdmin}
              <div class="text-center py-10">
                <p class="text-text-body font-medium">No season info yet.</p>
                <p class="text-text-muted text-sm mt-1">
                  Click Edit to add information for this season.
                </p>
              </div>
            {:else}
              <div class="text-center py-12">
                <svg
                  class="w-12 h-12 text-text-muted mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <p class="text-text-body text-lg font-medium">No season information available</p>
                <p class="text-text-muted text-sm mt-1">
                  Admins haven't published info for this season yet.
                </p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Main Content with Sidebars -->
    <div class="max-w-[1600px] mx-auto px-6 py-4">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left Sidebar - Deadlines -->
        <aside class="lg:col-span-3 space-y-4">
          <!-- Team Registration Deadline -->
          <div class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default p-6">
            <h3 class="text-sm font-medium text-text-body mb-3">Team Registration</h3>
            <div
              class="text-4xl font-black {data.deadlines.signupClosed
                ? 'text-danger-500'
                : 'text-success-500'} mb-4"
            >
              {data.deadlines.signupClosed ? 'CLOSED' : 'OPEN'}
            </div>
            {#if canSignUp}
              <Button href={signupHref} variant="format-2v2" size="md">Sign Up Now</Button>
            {/if}
          </div>

          <!-- Payments Due -->
          <div class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default p-6">
            <h3 class="text-sm font-medium text-text-body mb-4">Payment Status</h3>
            <div
              class="text-3xl font-black {data.deadlines.paymentRequired
                ? 'text-warning-500'
                : 'text-text-muted'} mb-2"
            >
              {data.deadlines.paymentRequired ? 'REQUIRED' : 'NOT REQUIRED'}
            </div>
            {#if data.deadlines.paymentRequired}
              <p class="text-xs text-text-body">Teams must pay registration fees</p>
            {/if}
          </div>

          <!-- Roster Lock Status -->
          <div class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default p-6">
            <h3 class="text-sm font-medium text-text-body mb-3">Roster Status</h3>
            <div
              class="text-3xl font-black {data.deadlines.rosterLocked
                ? 'text-danger-500'
                : 'text-success-500'} mb-2"
            >
              {data.deadlines.rosterLocked ? 'LOCKED' : 'OPEN'}
            </div>
            <p class="text-xs text-text-body">
              {data.deadlines.rosterLocked ? 'Rosters are frozen' : 'Teams can change rosters'}
            </p>
          </div>
        </aside>

        <!-- Center - Division Tables -->
        <main class="lg:col-span-6 space-y-8">
          {#if data.teamsByDivision.length === 0}
            <div
              class="bg-surface-card/50 backdrop-blur rounded-lg border border-border-default p-12 text-center"
            >
              <p class="text-text-body text-lg">No teams found for this season and region.</p>
              <p class="text-text-muted text-sm mt-2">
                Check back later or select a different season.
              </p>
            </div>
          {:else}
            {#each data.teamsByDivision as divisionData}
              <div
                class="bg-surface-card/50 backdrop-blur rounded-lg border border-border-default overflow-hidden"
              >
                <!-- Division Header -->
                <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
                  <h2 class="text-2xl font-bold text-white uppercase tracking-wide">
                    {divisionData.division.name}
                    <span class="text-text-muted">({getRegionAbbr(selectedRegion)})</span>
                  </h2>
                </div>

                <!-- Standings Table -->
                <DataTable
                  data={divisionData.teams}
                  columns={standingsColumns}
                  emptyMessage="No teams in this division"
                  rowClass={teamRowClass}
                >
                  {#snippet cell(team: PageData['teamsByDivision'][0]['teams'][0], col)}
                    {#if col.key === 'team'}
                      <a
                        href="/teams/{team.id}"
                        class="flex items-center gap-2 text-sm font-medium hover:text-format-2v2-400 transition-colors {team.isWithdrawn
                          ? 'text-text-body'
                          : 'text-white'}"
                      >
                        <img
                          src={team.avatar ||
                            `https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg`}
                          alt="{team.name} logo"
                          class="w-8 h-8 rounded object-cover {team.isWithdrawn ? 'grayscale' : ''}"
                        />
                        <span>{team.name}</span>
                        {#if team.isWithdrawn}
                          <span
                            class="px-1.5 py-0.5 text-xs font-medium bg-surface-hover text-text-body rounded"
                            >WITHDRAWN</span
                          >
                        {/if}
                      </a>
                    {:else if col.key === 'record'}
                      <span class="text-text-label text-sm">{team.wins}-{team.losses}</span>
                    {:else if col.key === 'points'}
                      <span
                        class="{team.isWithdrawn
                          ? 'text-text-body'
                          : 'text-white'} text-sm font-medium">{team.points.toFixed(1)}</span
                      >
                    {/if}
                  {/snippet}
                </DataTable>
              </div>
            {/each}
          {/if}
        </main>

        <!-- Right Sidebar - Staff List -->
        <aside class="lg:col-span-3">
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default sticky top-4"
          >
            <!-- Staff Header -->
            <div class="px-4 py-3 border-b border-border-default">
              <h3 class="text-lg font-bold text-white">Staff List</h3>
            </div>

            <!-- Staff List Content -->
            <div class="max-h-[calc(100vh-200px)] overflow-y-auto">
              {#if data.staffByDivision.length === 0}
                <div class="px-4 py-8 text-center">
                  <p class="text-text-muted text-sm">No staff members found.</p>
                </div>
              {:else}
                {#each data.staffByDivision as divisionStaff}
                  <div class="border-b border-border-default/50 last:border-0">
                    <!-- Division Header -->
                    <div class="px-4 py-2 bg-surface-page/50">
                      <h4 class="text-xs font-bold text-text-body uppercase tracking-wider">
                        {divisionStaff.division.name} ({getRegionAbbr(selectedRegion)})
                      </h4>
                    </div>

                    <!-- Staff Members -->
                    <div class="px-4 py-2 space-y-2">
                      {#each divisionStaff.staff as member}
                        <a
                          href="/users/{member.steamId}"
                          class="flex items-center justify-between py-2 hover:bg-surface-input/30 rounded px-2 -mx-2 transition-colors group"
                        >
                          <div class="flex items-center gap-2">
                            <img
                              src={member.avatar || `https://picsum.photos/seed/${member.name}/32`}
                              alt={member.name}
                              class="w-7 h-7 rounded"
                            />
                            <span
                              class="text-sm text-white group-hover:text-primary-400 transition-colors"
                            >
                              {member.name}
                            </span>
                          </div>
                          <span class="text-xs text-warning-500/80">
                            {member.role}
                          </span>
                        </a>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </aside>
      </div>
    </div>
  {/if}
</div>
