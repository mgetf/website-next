<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { PageData } from './$types';
  import DataTable from '#lib/components/ui/DataTable.svelte';
  import FilterBar from '#lib/components/ui/FilterBar.svelte';
  import SelectFilter from '#lib/components/ui/SelectFilter.svelte';
  import { toast } from '#lib/state/toast.svelte.js';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import { formatPlayoffRound } from '#lib/utils/playoffs.js';
  import { formatDateTime } from '#lib/utils/datetime.js';
  import {
    formatsWithSeasons,
    parseFilterId,
    regionsForFormat,
    resolveAdminMatchFilters,
    seasonsForScope,
  } from '#lib/utils/matchFilters.js';

  let { data }: { data: PageData } = $props();

  const matchColumns = [
    { key: 'match', label: 'Match' },
    { key: 'maps', label: 'Map(s)', align: 'center' as const },
    { key: 'date', label: 'Match Date', align: 'center' as const },
    { key: 'home', label: 'Home Team', align: 'right' as const },
    { key: 'score', label: 'Points', align: 'center' as const },
    { key: 'away', label: 'Away Team' },
  ];

  $effect(() => {
    const created = page.url.searchParams.get('created');
    const discarded = page.url.searchParams.get('discarded');
    if (created) {
      toast.success(`Successfully created ${created} match${created === '1' ? '' : 'es'}!`);
      const url = new URL(page.url.href);
      url.searchParams.delete('created');
      goto(url.toString(), { replace: true, reset: false });
    } else if (discarded) {
      toast.success('Draft discarded');
      const url = new URL(page.url.href);
      url.searchParams.delete('discarded');
      goto(url.toString(), { replace: true, reset: false });
    }
  });

  const selectedFormat = $derived(data.filters.formatId);
  const selectedRegion = $derived(data.filters.regionId);
  const selectedSeason = $derived(data.filters.seasonId);
  const selectedWeek = $derived(data.filters.week);

  const formatOptions = $derived(
    formatsWithSeasons(data.formats, data.seasons).map((format) => ({
      value: format.id.toString(),
      label: format.name,
    })),
  );

  const regionOptions = $derived(
    regionsForFormat(data.regions, data.seasons, parseFilterId(selectedFormat)).map((region) => ({
      value: region.id.toString(),
      label: region.name,
    })),
  );

  const seasonOptions = $derived(
    seasonsForScope(data.seasons, parseFilterId(selectedFormat), parseFilterId(selectedRegion)).map(
      (season) => ({
        value: season.id.toString(),
        label: `Season ${season.seasonNum}`,
      }),
    ),
  );

  const weekOptions = $derived(
    data.weekOptions.map((option) => ({ value: option.value, label: option.label })),
  );

  function gotoFilters(next: {
    formatId: string;
    regionId: string;
    seasonId: string;
    week?: string;
  }) {
    const params = new URLSearchParams();
    if (next.formatId) params.set('formatId', next.formatId);
    if (next.regionId) params.set('regionId', next.regionId);
    if (next.seasonId) params.set('seasonId', next.seasonId);
    if (next.week) params.set('week', next.week);
    goto(`/admin/matches?${params.toString()}`, { reset: false });
  }

  function onFormatChange(value: string) {
    const next = resolveAdminMatchFilters({
      formats: data.formats,
      regions: data.regions,
      seasons: data.seasons,
      formatId: parseFilterId(value),
      regionId: parseFilterId(selectedRegion),
      seasonId: parseFilterId(selectedSeason),
    });
    gotoFilters({
      formatId: next.formatId?.toString() ?? '',
      regionId: next.regionId?.toString() ?? '',
      seasonId: next.seasonId?.toString() ?? '',
    });
  }

  function onRegionChange(value: string) {
    const next = resolveAdminMatchFilters({
      formats: data.formats,
      regions: data.regions,
      seasons: data.seasons,
      formatId: parseFilterId(selectedFormat),
      regionId: parseFilterId(value),
      seasonId: parseFilterId(selectedSeason),
    });
    gotoFilters({
      formatId: next.formatId?.toString() ?? '',
      regionId: next.regionId?.toString() ?? '',
      seasonId: next.seasonId?.toString() ?? '',
    });
  }

  function onSeasonChange(value: string) {
    gotoFilters({
      formatId: selectedFormat,
      regionId: selectedRegion,
      seasonId: value,
    });
  }

  function onWeekChange(value: string) {
    gotoFilters({
      formatId: selectedFormat,
      regionId: selectedRegion,
      seasonId: selectedSeason,
      week: value,
    });
  }

  function formatMatchDate(dateTime: string | Date | null): string {
    if (!dateTime) return '-';
    const date = new Date(dateTime);
    return (
      date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      }) +
      ' ' +
      date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
    );
  }

  function getMatchTitle(match: any): string {
    const divisionName = match.homeTeam?.division?.name || '';

    if (match.playoffRound) {
      const playoffName = match.playoff?.name || 'Playoffs';
      return `${playoffName} - ${formatPlayoffRound(match.playoffRound)}`;
    }

    const weekLabel = match.weekLabel || match.weekNo;
    return `Week ${weekLabel} - ${divisionName}`;
  }

  function getScoreDisplay(match: any): string {
    if (match.winnerId) {
      const homeWon = match.winnerId === match.homeTeamId;
      const homeScore = homeWon ? match.winnerScore : match.loserScore;
      const awayScore = homeWon ? match.loserScore : match.winnerScore;
      return `${homeScore} - ${awayScore}`;
    }
    return '-';
  }

  function getWinnerClass(match: any, teamId: number): string {
    if (!match.winnerId) return '';
    return match.winnerId === teamId ? 'font-bold' : 'opacity-60';
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-white mb-2">Match Management</h1>
      <p class="text-text-body">View and manage league matches by week</p>
    </div>
    <Button variant="primary" href="/admin/matches/create" size="lg">+ Create Matches</Button>
  </div>

  {#if data.pendingDrafts.length > 0}
    <Card padding="none" class="overflow-hidden">
      <div
        class="bg-warning-500/10 px-6 py-4 border-b border-warning-500/30 flex items-center justify-between gap-4"
      >
        <div>
          <h2 class="text-lg font-bold text-white">Pending drafts</h2>
          <p class="text-sm text-text-body">Saved match sets waiting for an admin to publish</p>
        </div>
        <Badge color="yellow">{data.pendingDrafts.length}</Badge>
      </div>
      <DataTable
        data={data.pendingDrafts}
        columns={[
          { key: 'scope', label: 'Division' },
          { key: 'round', label: 'Round' },
          { key: 'matches', label: 'Matches', align: 'center' },
          { key: 'author', label: 'Created by' },
          { key: 'saved', label: 'Saved' },
          { key: 'actions', label: 'Actions', align: 'right', srOnly: true },
        ]}
      >
        {#snippet cell(draft, col)}
          {#if col.key === 'scope'}
            <div>
              <div class="font-semibold text-white">{draft.divisionName}</div>
              <div class="text-xs text-text-muted">
                {draft.formatName} · {draft.regionName} · Season {draft.seasonNo}
              </div>
            </div>
          {:else if col.key === 'round'}
            <span class="text-text-label">
              {#if draft.isPlayoff && draft.playoffRound != null}
                {formatPlayoffRound(draft.playoffRound)}
              {:else if draft.weekNo != null}
                Week {draft.weekNo}
              {:else}
                —
              {/if}
            </span>
          {:else if col.key === 'matches'}
            <span class="text-white">{draft.matchCount}</span>
          {:else if col.key === 'author'}
            <span class="text-text-label">{draft.createdByName}</span>
          {:else if col.key === 'saved'}
            <span class="text-text-body">{formatDateTime(draft.createdAt)}</span>
          {:else if col.key === 'actions'}
            <Button href="/admin/matches/drafts/{draft.id}" variant="secondary" size="sm"
              >Review</Button
            >
          {/if}
        {/snippet}
      </DataTable>
    </Card>
  {/if}

  <!-- Filters -->
  <FilterBar>
    {#snippet filters()}
      <div class="md:w-40">
        <label for="match-format" class="block text-sm font-medium text-text-body mb-2"
          >Format</label
        >
        <SelectFilter
          id="match-format"
          value={selectedFormat}
          options={formatOptions}
          showAllOption={false}
          disabled={formatOptions.length === 0}
          allLabel="No formats"
          onChange={onFormatChange}
        />
      </div>

      <div class="md:w-40">
        <label for="match-region" class="block text-sm font-medium text-text-body mb-2"
          >Region</label
        >
        <SelectFilter
          id="match-region"
          value={selectedRegion}
          options={regionOptions}
          showAllOption={false}
          disabled={regionOptions.length === 0}
          allLabel={selectedFormat ? 'No regions' : 'Pick a format first'}
          onChange={onRegionChange}
        />
      </div>

      <div class="md:w-40">
        <label for="match-season" class="block text-sm font-medium text-text-body mb-2"
          >Season</label
        >
        <SelectFilter
          id="match-season"
          value={selectedSeason}
          options={seasonOptions}
          showAllOption={false}
          disabled={!selectedRegion || seasonOptions.length === 0}
          allLabel={selectedRegion ? 'No seasons' : 'Pick a region first'}
          onChange={onSeasonChange}
        />
      </div>

      <div class="md:w-48">
        <label for="match-round" class="block text-sm font-medium text-text-body mb-2">Round</label>
        <SelectFilter
          id="match-round"
          value={selectedWeek}
          options={weekOptions}
          showAllOption={false}
          disabled={!selectedSeason || weekOptions.length === 0}
          allLabel={selectedSeason ? 'No rounds' : 'Pick a season first'}
          onChange={onWeekChange}
        />
      </div>
    {/snippet}
  </FilterBar>

  <!-- Matches by Division -->
  {#if data.matchesByDivision.length === 0}
    <Card padding="none" class="p-12 text-center">
      <p class="text-text-body text-lg">No matches found for the selected filters</p>
      <p class="text-text-muted mt-2">Try selecting a different week or season</p>
    </Card>
  {:else}
    {#each data.matchesByDivision as division (division.id)}
      <Card padding="none" class="overflow-hidden">
        <!-- Division Header -->
        <div class="bg-surface-input px-6 py-4 border-b border-border-input">
          <h3 class="text-xl font-bold text-white text-center">{division.name}</h3>
        </div>

        <!-- Match Table -->
        <DataTable data={division.matches} columns={matchColumns}>
          {#snippet cell(match, col)}
            {#if col.key === 'match'}
              <a href="/matches/{match.id}" class="text-info-400 hover:text-white hover:underline">
                {getMatchTitle(match)}
              </a>
            {:else if col.key === 'maps'}
              <div class="flex items-center justify-center gap-1">
                {#each match.games as game (game.id)}
                  {#if game.arena}
                    <div class="relative group">
                      {#if game.arena.avatar}
                        <img
                          src={game.arena.avatar}
                          alt={game.arena.name}
                          class="w-8 h-8 rounded object-cover"
                          title={game.arena.name}
                        />
                      {:else}
                        <div
                          class="w-8 h-8 rounded bg-surface-hover flex items-center justify-center text-xs text-text-body"
                          title={game.arena.name}
                        >
                          {game.arena.name.slice(0, 2).toUpperCase()}
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <div
                      class="w-8 h-8 rounded bg-surface-hover/50 flex items-center justify-center text-xs text-text-muted"
                    >
                      ?
                    </div>
                  {/if}
                {/each}
                {#if match.games.length === 0}
                  <span class="text-text-muted text-sm">-</span>
                {/if}
              </div>
            {:else if col.key === 'date'}
              <span class="text-sm text-text-label">{formatMatchDate(match.matchDateTime)}</span>
            {:else if col.key === 'home'}
              <a
                href="/teams/{match.homeTeam.id}"
                class="text-primary-400 hover:text-primary-300 hover:underline {getWinnerClass(
                  match,
                  match.homeTeamId,
                )}"
              >
                {match.homeTeam.name}
              </a>
            {:else if col.key === 'score'}
              <span class="text-white font-semibold">{getScoreDisplay(match)}</span>
            {:else if col.key === 'away'}
              <a
                href="/teams/{match.awayTeam.id}"
                class="text-primary-400 hover:text-primary-300 hover:underline {getWinnerClass(
                  match,
                  match.awayTeamId,
                )}"
              >
                {match.awayTeam.name}
              </a>
            {/if}
          {/snippet}
        </DataTable>

        <!-- Division Footer -->
        <div class="px-6 py-3 bg-surface-input/30 border-t border-border-input text-center">
          <span class="text-sm text-text-body">
            {division.matches.length} match{division.matches.length === 1 ? '' : 'es'}
          </span>
        </div>
      </Card>
    {/each}
  {/if}
</div>
