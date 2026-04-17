<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { dndzone } from 'svelte-dnd-action';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { data }: { data: PageData } = $props();

  let isPlayoff = $state(false);
  let selectedRegionId = $state<number | null>(null);
  let selectedDivisionId = $state<number | null>(null);
  let selectedSeasonId = $state<number | null>(null);
  let weekNo = $state<number | null>(null);
  let boSeries = $state(1);
  let selectedArenaId = $state<number | null>(null);
  let matchDateTime = $state('');
  let matchTimezone = $state('UTC');
  let mapBanPoolId = $state<number | null>(null);
  let playoffRound = $state<number | null>(null);
  let boGames = $state<number | null>(null);

  const TIMEZONES = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'EDT/EST (US East)' },
    { value: 'America/Chicago', label: 'CDT/CST (US Central)' },
    { value: 'America/Denver', label: 'MDT/MST (US Mountain)' },
    { value: 'America/Los_Angeles', label: 'PDT/PST (US West)' },
    { value: 'Europe/London', label: 'BST/GMT (London)' },
    { value: 'Europe/Berlin', label: 'CEST/CET (Central Europe)' },
    { value: 'Europe/Helsinki', label: 'EEST/EET (East Europe)' },
    { value: 'Asia/Tokyo', label: 'JST (Japan)' },
    { value: 'Australia/Sydney', label: 'AEST/AEDT (Sydney)' },
  ];

  let previewMatchups = $state<any[]>([]);
  let previewByeTeam = $state<any | null>(null);
  
  type DndTeam = {
    id: number;
    name: string;
    acronym: string | null;
    wins: number;
    losses: number;
    seed: number;
  };

  let dndItems = $state<DndTeam[]>([]);
  let originalDndItems: DndTeam[] = [];
  let playoffMatchups = $state<any[]>([]);

  let weekLabel = $state<string | null>(null);
  let existingMatchSetsCount = $state(0);
  let showPreview = $state(false);

  const previewPairs = $derived.by(() => {
    const pairs: { home: DndTeam; away: DndTeam }[] = [];
    for (let i = 0; i + 1 < dndItems.length; i += 2) {
      pairs.push({ home: dndItems[i], away: dndItems[i + 1] });
    }
    return pairs;
  });

  const previewByeTeam = $derived(dndItems.length % 2 === 1 ? dndItems[dndItems.length - 1] : null);

  let isCreating = $state(false);
  let isPreviewing = $state(false);

  const selectedSeason = $derived(
    selectedSeasonId ? data.seasons.find((s) => s.id === selectedSeasonId) : null,
  );

  const regionsWithSeasons = $derived(
    data.regions.filter((r) => data.seasons.some((s) => s.regionId === r.id)),
  );

  const seasonsForRegion = $derived(
    selectedRegionId ? data.seasons.filter((s) => s.regionId === selectedRegionId) : [],
  );

  const divisionsForRegion = $derived(
    selectedRegionId ? data.divisions.filter((d) => d.regionId === selectedRegionId) : [],
  );

  const canPreview = $derived(
    selectedRegionId &&
      selectedDivisionId &&
      selectedSeasonId &&
      (isPlayoff ? playoffRound : weekNo),
  );

  const selectedSeasonPlayoff = $derived(
    selectedSeasonId ? data.playoffs?.find((p) => p.seasonId === selectedSeasonId) : null,
  );

  const playoffRounds = $derived.by(() => {
    if (!selectedSeasonPlayoff) return [];

    const rounds: { value: number; label: string }[] = [];

    if (selectedSeasonPlayoff.numRounds) {
      for (let i = 1; i <= selectedSeasonPlayoff.numRounds; i++) {
        rounds.push({
          value: i,
          label: `Upper Round ${i}`,
        });
      }

      if (selectedSeasonPlayoff.doubleElim === 1) {
        for (let i = 1; i <= selectedSeasonPlayoff.numRounds * 2; i++) {
          rounds.push({
            value: -i,
            label: `Lower Round ${i}`,
          });
        }
      }
    }

    return rounds;
  });

  let previewTeams = $state<any[]>([]);

  function buildDndItems(preview: any): DndTeam[] {
    const items: DndTeam[] = [];
    for (const matchup of preview.matchups || []) {
      if (matchup.home) items.push(matchup.home);
      if (matchup.away) items.push(matchup.away);
    }
    if (preview.byeTeam) items.push(preview.byeTeam);
    return items;
  }

  const handlePreviewEnhance = () => {
    isPreviewing = true;

    return async ({ result, update }: any) => {
      if (result.type === 'success' && result.data && 'preview' in result.data) {
        const preview = (result.data as any).preview;
        previewTeams = preview.teams || [];
        weekLabel = preview.weekLabel || null;
        existingMatchSetsCount = preview.existingCount || 0;
        showPreview = true;

        if (preview.isPlayoff) {
          playoffMatchups = preview.matchups || [];
        } else {
          const items = buildDndItems(preview);
          dndItems = items;
          originalDndItems = [...items];
        }
      } else if (result.type === 'failure') {
        alert(`Error: ${result.data?.error || 'Failed to preview matches'}`);
      }

      isPreviewing = false;
    };
  };

  const handleCreateEnhance = () => {
    isCreating = true;

    return async ({ result, update }: any) => {
      console.log('Create form result:', result);

      if (result.type === 'failure') {
        console.error('Form submission failed:', result);
        isCreating = false;
        alert(`Error: ${result.data?.error || 'Failed to create matches'}`);
      }

      if (result.type === 'redirect') {
        // Keep loading state true during redirect
      } else {
        isCreating = false;
      }

      await update();
    };
  };

  function handleDndConsider(e: CustomEvent) {
    dndItems = (e as CustomEvent<{ items: DndTeam[] }>).detail.items;
  }

  function handleDndFinalize(e: CustomEvent) {
    dndItems = (e as CustomEvent<{ items: DndTeam[] }>).detail.items;
  }

  function resetToSuggestedPairing() {
    dndItems = [...originalDndItems];
  }

  function onFieldChange() {
    if (showPreview) {
      showPreview = false;
      dndItems = [];
      originalDndItems = [];
      playoffMatchups = [];
      weekLabel = null;
      existingMatchSetsCount = 0;
    }
  }

  function onRegionChange() {
    selectedDivisionId = null;
    selectedSeasonId = null;
    onFieldChange();
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <h1 class="text-4xl font-bold text-white mb-8">Create Match Set</h1>

  <!-- Main Form -->
  <Card padding="lg">
    <form method="POST" action="?/previewMatches" use:enhance={handlePreviewEnhance}>
      <div class="space-y-4">
        <!-- Playoff Match -->
        <div>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              name="isPlayoff"
              bind:checked={isPlayoff}
              class="rounded bg-surface-input border-border-input"
            />
            <span class="text-text-label">Playoff Match</span>
          </label>
        </div>

        <!-- Region -->
        <div>
          <FormSelect
            label="Region"
            name="regionId"
            value={String(selectedRegionId ?? '')}
            required
            placeholder="Select Region"
            options={regionsWithSeasons.map((r) => ({ value: String(r.id), label: r.name }))}
            onChange={(v) => {
              selectedRegionId = v ? parseInt(v) : null;
              onRegionChange();
            }}
          />
        </div>

        <!-- Division -->
        <div>
          <FormSelect
            label="Division"
            name="divisionId"
            value={String(selectedDivisionId ?? '')}
            required
            disabled={!selectedRegionId}
            placeholder={selectedRegionId ? 'Select Division' : 'Select Region First'}
            options={divisionsForRegion.map((d) => ({ value: String(d.id), label: d.name }))}
            onChange={(v) => {
              selectedDivisionId = v ? parseInt(v) : null;
              onFieldChange();
            }}
          />
        </div>

        <!-- Season -->
        <div>
          <FormSelect
            label="Season"
            name="seasonId"
            value={String(selectedSeasonId ?? '')}
            required
            disabled={!selectedRegionId}
            placeholder={selectedRegionId ? 'Select Season' : 'Select Region First'}
            options={seasonsForRegion.map((s) => ({
              value: String(s.id),
              label: `Season ${s.seasonNum} (${s.format.name})`,
            }))}
            onChange={(v) => {
              selectedSeasonId = v ? parseInt(v) : null;
              onFieldChange();
            }}
          />
          {#if selectedSeason}
            {@const formatName = selectedSeason.format.name}
            {@const colorClasses =
              formatName === '1v1'
                ? 'bg-format-1v1-500/10 border-format-1v1-500/30 text-format-1v1-300'
                : formatName === '2v2'
                  ? 'bg-info-500/10 border-info-500/30 text-info-300'
                  : 'bg-surface-input border-border-input text-text-label'}
            <p
              class="mt-2 px-3 py-1.5 rounded-md border text-sm font-medium inline-block {colorClasses}"
            >
              Format: {formatName}
            </p>
          {/if}
        </div>

        <!-- Playoff Round -->
        {#if isPlayoff}
          <div>
            <FormSelect
              label="Playoff Round"
              name="playoffRound"
              value={String(playoffRound ?? '')}
              required
              disabled={!selectedSeasonPlayoff}
              placeholder={selectedSeasonPlayoff
                ? 'Select Round'
                : 'No playoff configured for this season'}
              options={playoffRounds.map((r) => ({ value: String(r.value), label: r.label }))}
              error={selectedSeasonId && !selectedSeasonPlayoff
                ? 'No playoff configuration found for this season. Please configure playoffs in League Configuration first.'
                : undefined}
              onChange={(v) => {
                playoffRound = v ? parseInt(v) : null;
                onFieldChange();
              }}
            />
          </div>
        {/if}

        <!-- Week Number -->
        {#if !isPlayoff}
          <div>
            <label for="weekNo" class="block text-sm font-medium text-text-label mb-1"
              >Week Number</label
            >
            <input
              id="weekNo"
              type="number"
              name="weekNo"
              bind:value={weekNo}
              oninput={onFieldChange}
              required
              min="1"
              max={selectedSeason?.numWeeks || 999}
              disabled={!selectedSeasonId}
              class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={selectedSeasonId
                ? `Enter week (1-${selectedSeason?.numWeeks || '?'})`
                : 'Select Season First'}
            />
            {#if selectedSeason}
              <p class="text-xs text-text-muted mt-1">
                Season has {selectedSeason.numWeeks} weeks
              </p>
            {/if}
          </div>
        {/if}

        <!-- Arena (Regular Matches Only) -->
        {#if !isPlayoff}
          <div>
            <FormSelect
              label="Arena"
              name="arenaId"
              value={String(selectedArenaId ?? '')}
              placeholder="No Default Arena"
              options={data.arenas.map((a) => ({ value: String(a.id), label: a.name }))}
              hint="Optional: Set default arena for all games"
              onChange={(v) => {
                selectedArenaId = v ? parseInt(v) : null;
              }}
            />
          </div>
        {/if}

        <!-- Map Ban Pool (Playoff Matches Only) -->
        {#if isPlayoff}
          <div>
            <FormSelect
              label="Map Ban Pool"
              name="mapBanPoolId"
              value={String(mapBanPoolId ?? '')}
              required
              placeholder="Select Map Ban Pool"
              options={data.mapBanPools
                .filter((p) => p.isActive)
                .map((p) => ({ value: String(p.id), label: p.name }))}
              hint="Required: Map ban pool for playoff matches"
              onChange={(v) => {
                mapBanPoolId = v ? parseInt(v) : null;
              }}
            />
          </div>
        {/if}

        <!-- Best of Games (Playoff Matches Only) -->
        {#if isPlayoff}
          <div>
            <FormSelect
              label="Best of Games (per Arena)"
              name="boGames"
              value={String(boGames ?? '')}
              placeholder="Default (1 game per arena)"
              options={[
                { value: '1', label: '1' },
                { value: '3', label: '3' },
                { value: '5', label: '5' },
                { value: '7', label: '7' },
              ]}
              hint="Optional: Number of games to play on each arena"
              onChange={(v) => {
                boGames = v ? parseInt(v) : null;
              }}
            />
          </div>
        {/if}

        <!-- Best of Series -->
        <div>
          <FormSelect
            label="Best of Series"
            name="boSeries"
            value={String(boSeries)}
            required
            options={[
              { value: '1', label: '1' },
              { value: '3', label: '3' },
              { value: '5', label: '5' },
              { value: '7', label: '7' },
            ]}
            onChange={(v) => {
              boSeries = v ? parseInt(v) : 1;
            }}
          />
        </div>

        <!-- Match Date and Time -->
        <div>
          <label for="matchDateTime" class="block text-sm font-medium text-text-label mb-1"
            >Match Date and Time</label
          >
          <input
            id="matchDateTime"
            type="datetime-local"
            name="matchDateTime"
            bind:value={matchDateTime}
            class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500"
          />
          <p class="text-xs text-text-muted mt-1">
            Optional: Default scheduled time (enter in the timezone selected below)
          </p>
        </div>

        <!-- Timezone -->
        <div>
          <FormSelect
            label="Timezone"
            name="matchTimezone"
            bind:value={matchTimezone}
            options={TIMEZONES}
            hint="Timezone for the match date/time above"
          />
        </div>

        <input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />

        <!-- Preview Button -->
        <Button
          variant="primary"
          type="submit"
          disabled={!canPreview || isPreviewing}
          class="w-full"
        >
          {isPreviewing ? 'Loading Preview...' : 'Preview Match Set'}
        </Button>
      </div>
    </form>
  </Card>

  <!-- Preview Section -->
  {#if showPreview}
    <Card padding="lg">
      <h2 class="text-2xl font-bold text-white mb-4">Match Preview</h2>

      {#if weekLabel && !isPlayoff}
        <div class="mb-4 p-3 bg-info-500/10 border border-info-500/30 rounded-lg">
          <p class="text-info-300 text-sm">
            This will create <strong class="text-white">Week {weekLabel}</strong>
            {#if existingMatchSetsCount > 0}
              ({existingMatchSetsCount} existing match set{existingMatchSetsCount === 1 ? '' : 's'} for
              this week)
            {/if}
          </p>
        </div>
      {/if}

      {#if isPlayoff ? playoffMatchups.length === 0 : dndItems.length === 0}
        <div class="text-center py-8">
          <p class="text-text-body">No eligible teams found for this configuration.</p>
          <p class="text-sm text-text-muted mt-2">
            Teams must have status READY and be in the selected division/region.
          </p>
        </div>
      {:else if isPlayoff}
        <!-- Playoff Match Selection -->
        <form
          method="POST"
          action="?/createMatchSet"
          use:enhance={handleCreateEnhance}
          class="space-y-4"
        >
          <input type="hidden" name="regionId" value={selectedRegionId} />
          <input type="hidden" name="divisionId" value={selectedDivisionId} />
          <input type="hidden" name="seasonId" value={selectedSeasonId} />
          <input type="hidden" name="boSeries" value={boSeries} />
          <input type="hidden" name="matchDateTime" value={matchDateTime} />
          <input type="hidden" name="matchTimezone" value={matchTimezone} />
          <input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />
          <input type="hidden" name="isPlayoff" value="on" />
          <input type="hidden" name="playoffRound" value={playoffRound || ''} />
          <input type="hidden" name="boGames" value={boGames || ''} />

          <div class="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <p class="text-purple-300 text-sm">
              <strong class="text-white"
                >Playoff Round {playoffRound && playoffRound > 0
                  ? playoffRound
                  : `Lower ${Math.abs(playoffRound || 0)}`}</strong
              >
              - Select teams manually for each matchup
            </p>
          </div>

          <p class="text-text-label mb-4">
            <span class="font-semibold text-white">{playoffMatchups.length} matches</span> will be created.
            Select teams for each matchup:
          </p>

          <!-- Manual Team Selection for Playoffs -->
          <div class="space-y-4">
            {#each playoffMatchups as matchup, i}
              <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
                <h4 class="text-white font-semibold mb-3">Match {i + 1}</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FormSelect
                      label="Home Team"
                      name="homeTeamIds"
                      required
                      placeholder="Select Home Team"
                      options={previewTeams.map((t) => ({
                        value: String(t.id),
                        label: `${t.name} (Seed #${t.seed}, ${t.wins}-${t.losses})`,
                      }))}
                    />
                  </div>

                  <div>
                    <FormSelect
                      label="Away Team"
                      name="awayTeamIds"
                      required
                      placeholder="Select Away Team"
                      options={previewTeams.map((t) => ({
                        value: String(t.id),
                        label: `${t.name} (Seed #${t.seed}, ${t.wins}-${t.losses})`,
                      }))}
                    />
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <Button variant="success" type="submit" disabled={isCreating} class="w-full mt-6">
            {isCreating
              ? 'Creating...'
              : `Create ${playoffMatchups.length} Playoff Match${playoffMatchups.length === 1 ? '' : 'es'}`}
          </Button>
        </form>
      {:else}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-text-label">
              <span class="font-semibold text-white"
                >{previewPairs.length} match{previewPairs.length === 1 ? '' : 'es'}</span
              >
              will be created. Drag teams to change pairings or home/away sides.
            </p>
            <Button variant="ghost" size="sm" onclick={resetToSuggestedPairing}>
              Reset to suggested
            </Button>
          </div>

          <!-- Column headers -->
          <div class="grid grid-cols-[1fr_32px_1fr] gap-x-0 px-1">
            <span class="text-xs font-medium text-text-muted uppercase tracking-wider">Home</span>
            <span></span>
            <span class="text-xs font-medium text-text-muted uppercase tracking-wider">Away</span>
          </div>

          <!-- Draggable grid — even positions = home (left), odd = away (right), last if odd count = bye (spans both) -->
          <div
            use:dndzone={{ items: dndItems, flipDurationMs: 200 }}
            onconsider={handleDndConsider}
            onfinalize={handleDndFinalize}
            class="grid grid-cols-2 gap-y-2 gap-x-0"
          >
            {#each dndItems as team, i (team.id)}
              {@const isLastOdd = i === dndItems.length - 1 && dndItems.length % 2 === 1}
              {@const isHome = i % 2 === 0}
              {@const matchNum = Math.floor(i / 2) + 1}
              <div
                class="flex items-center gap-2 px-3 py-3 cursor-grab select-none border
                  {isLastOdd
                  ? 'col-span-2 mt-4 rounded-lg bg-warning-500/10 border-warning-500/30'
                  : isHome
                    ? 'rounded-l-lg border-r-0 bg-surface-input border-l-2 border-l-primary-600 border-border-input'
                    : 'rounded-r-lg bg-surface-input/60 border-border-input'}"
              >
                <span class="text-text-muted text-sm leading-none">⠿</span>
                <div class="flex-1 min-w-0">
                  {#if isLastOdd}
                    <div class="text-xs font-semibold text-warning-300 uppercase tracking-wider mb-1">
                      Bye week
                    </div>
                  {:else if isHome}
                    <div class="text-xs font-medium text-primary-400 mb-0.5">Match {matchNum}</div>
                  {/if}
                  <div class="text-white font-semibold truncate">{team.name}</div>
                  <div class="text-xs text-text-body">
                    #{team.seed} · {team.wins}W-{team.losses}L
                  </div>
                </div>
                {#if isHome && !isLastOdd}
                  <span class="text-text-muted text-xs font-medium shrink-0 pr-1">vs</span>
                {/if}
              </div>
            {/each}
          </div>

          {#if previewByeTeam}
            <p class="text-xs text-warning-400">
              Drag {previewByeTeam.name} into any match position to give them an opponent.
            </p>
          {/if}

          <!-- Create form — serialises current pairing order as hidden inputs -->
          <form method="POST" action="?/createMatchSet" use:enhance={handleCreateEnhance}>
            <input type="hidden" name="regionId" value={selectedRegionId} />
            <input type="hidden" name="divisionId" value={selectedDivisionId} />
            <input type="hidden" name="seasonId" value={selectedSeasonId} />
            <input type="hidden" name="weekNo" value={weekNo || ''} />
            <input type="hidden" name="boSeries" value={boSeries} />
            <input type="hidden" name="arenaId" value={selectedArenaId || ''} />
            <input type="hidden" name="matchDateTime" value={matchDateTime} />
            <input type="hidden" name="matchTimezone" value={matchTimezone} />
            <input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />

            {#each previewPairs as pair}
              <input type="hidden" name="homeTeamIds" value={pair.home.id} />
              <input type="hidden" name="awayTeamIds" value={pair.away.id} />
            {/each}

            <Button
              variant="success"
              type="submit"
              disabled={isCreating || previewPairs.length === 0}
              class="w-full mt-6"
            >
              {isCreating
                ? 'Creating...'
                : `Create ${previewPairs.length} Match${previewPairs.length === 1 ? '' : 'es'}`}
            </Button>
          </form>
        </div>
      {/if}
    </Card>
  {/if}
</div>

<!-- Loading Modal -->
{#if isCreating}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div
      class="bg-surface-card border border-border-default rounded-lg p-8 flex flex-col items-center space-y-4"
    >
      <div
        class="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"
      ></div>

      <div class="text-center">
        <p class="text-xl font-semibold text-white">Creating matches...</p>
        <p class="text-sm text-text-body mt-2">Please wait while we create your match set</p>
      </div>
    </div>
  </div>
{/if}
