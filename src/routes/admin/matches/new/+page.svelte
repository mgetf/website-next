<script lang="ts">
  import { tick } from 'svelte';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { SingleMatchBoard, SingleMatchBoardTeam } from '#lib/types/matchSetDraft.js';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '#lib/components/ui/form/FormInput.svelte';
  import FormSelect from '#lib/components/ui/form/FormSelect.svelte';
  import { toast } from '#lib/state/toast.svelte.js';
  import { filterDivisionsByRegionAndFormat } from '#lib/utils/leagueScope.js';
  import { formatPlayoffRound } from '#lib/utils/playoffs.js';
  import { describeSingleMatchWarnings } from '#lib/utils/singleMatch.js';

  let { data }: { data: PageData } = $props();

  const TIMEZONES = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'EDT/EST (US East)' },
    { value: 'America/Chicago', label: 'CDT/CST (US Central)' },
    { value: 'America/Denver', label: 'MDT/MST (US Mountain)' },
    { value: 'America/Los_Angeles', label: 'PDT/PST (US West)' },
    { value: 'Europe/London', label: 'BST/GMT (London)' },
    { value: 'Europe/Berlin', label: 'CEST/CET (Central Europe)' },
    { value: 'Europe/Helsinki', label: 'EEST/EET (East Europe)' },
    { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
    { value: 'Asia/Tokyo', label: 'JST (Japan)' },
    { value: 'Australia/Sydney', label: 'AEST/AEDT (Sydney)' },
  ];

  type ComposerFields = {
    isPlayoff: boolean;
    formatId: number | null;
    regionId: number | null;
    divisionId: number | null;
    weekNo: string;
    playoffRound: number | null;
    boSeries: string;
    boGames: string;
    arenaId: number | null;
    mapBanPoolId: number | null;
    matchDateTime: string;
    matchTimezone: string;
    homeTeamId: number | null;
    awayTeamId: number | null;
  };

  const blankFields: ComposerFields = {
    isPlayoff: false,
    formatId: null,
    regionId: null,
    divisionId: null,
    weekNo: '',
    playoffRound: null,
    boSeries: '1',
    boGames: '',
    arenaId: null,
    mapBanPoolId: null,
    matchDateTime: '',
    matchTimezone: 'UTC',
    homeTeamId: null,
    awayTeamId: null,
  };

  function fieldsFromDraft(draft: NonNullable<PageData['draft']>): ComposerFields {
    return {
      isPlayoff: draft.isPlayoff,
      formatId: draft.formatId,
      regionId: draft.regionId,
      divisionId: draft.divisionId,
      weekNo: draft.weekNo != null ? String(draft.weekNo) : '',
      playoffRound: draft.playoffRound,
      boSeries: String(draft.boSeries),
      boGames: draft.boGames != null ? String(draft.boGames) : '',
      arenaId: draft.arenaId,
      mapBanPoolId: draft.mapBanPoolId,
      matchDateTime: draft.matchDateTime,
      matchTimezone: draft.matchTimezone || 'UTC',
      homeTeamId: draft.pairings[0]?.home.id ?? null,
      awayTeamId: draft.pairings[0]?.away.id ?? null,
    };
  }

  let edits = $state<Partial<ComposerFields>>({});
  let activeSlot = $state<'home' | 'away'>('home');
  let teamQuery = $state('');
  let boardOverride = $state.raw<SingleMatchBoard | null | undefined>(undefined);
  let isLoadingBoard = $state(false);
  let isSaving = $state(false);
  let pendingAction = $state<'save' | 'publish' | null>(null);
  let confirmPublish = $state(false);
  let boardForm = $state<HTMLFormElement>();
  let publishButton = $state<HTMLButtonElement>();
  let boardTimer: ReturnType<typeof setTimeout> | undefined;

  function patch(next: Partial<ComposerFields>) {
    edits = { ...edits, ...next };
  }

  const form = $derived<ComposerFields>({
    ...(data.draft ? fieldsFromDraft(data.draft) : blankFields),
    ...edits,
  });
  const isPlayoff = $derived(form.isPlayoff);
  const selectedFormatId = $derived(form.formatId);
  const selectedRegionId = $derived(form.regionId);
  const selectedDivisionId = $derived(form.divisionId);
  const weekNo = $derived(form.weekNo);
  const playoffRound = $derived(form.playoffRound);
  const boSeries = $derived(form.boSeries);
  const boGames = $derived(form.boGames);
  const selectedArenaId = $derived(form.arenaId);
  const mapBanPoolId = $derived(form.mapBanPoolId);
  const matchDateTime = $derived(form.matchDateTime);
  const matchTimezone = $derived(form.matchTimezone);
  const homeTeamId = $derived(form.homeTeamId);
  const awayTeamId = $derived(form.awayTeamId);

  const board = $derived(boardOverride === undefined ? data.board : boardOverride);
  const isStrictAdmin = $derived(data.isStrictAdmin);

  const currentSeason = $derived(
    selectedFormatId != null && selectedRegionId != null
      ? (data.activeSeasons.find(
          (row) => row.formatId === selectedFormatId && row.regionId === selectedRegionId,
        ) ?? null)
      : null,
  );

  const formatOptions = $derived(
    data.activeSeasons
      .filter(
        (row, index, rows) => rows.findIndex((other) => other.formatId === row.formatId) === index,
      )
      .map((row) => ({ value: String(row.formatId), label: row.formatName }))
      .sort((a, b) => Number(a.value) - Number(b.value)),
  );

  const regionsForSelectedFormat = $derived(
    data.regions.filter((region) =>
      data.activeSeasons.some(
        (row) => row.formatId === selectedFormatId && row.regionId === region.id,
      ),
    ),
  );

  const divisionsForScope = $derived(
    filterDivisionsByRegionAndFormat(
      data.divisions,
      selectedRegionId ? String(selectedRegionId) : '',
      selectedFormatId ? String(selectedFormatId) : '',
    ),
  );

  const selectedSeasonPlayoff = $derived(
    currentSeason
      ? data.playoffs.find((playoff) => playoff.seasonId === currentSeason.seasonId)
      : null,
  );

  const playoffRounds = $derived.by(() => {
    if (!selectedSeasonPlayoff?.numRounds) return [];
    const rounds: { value: string; label: string }[] = [];
    for (let round = 1; round <= selectedSeasonPlayoff.numRounds; round++) {
      rounds.push({ value: String(round), label: `Upper Round ${round}` });
    }
    if (selectedSeasonPlayoff.doubleElim === 1) {
      for (let round = 1; round <= selectedSeasonPlayoff.numRounds * 2; round++) {
        rounds.push({ value: String(-round), label: `Lower Round ${round}` });
      }
    }
    return rounds;
  });

  const homeTeam = $derived(board?.teams.find((team) => team.id === homeTeamId) ?? null);
  const awayTeam = $derived(board?.teams.find((team) => team.id === awayTeamId) ?? null);
  const blockedTeamId = $derived(activeSlot === 'home' ? awayTeamId : homeTeamId);

  const visibleTeams = $derived.by(() => {
    const query = teamQuery.trim().toLowerCase();
    const teams = board?.teams ?? [];
    if (!query) return teams;
    return teams.filter(
      (team) =>
        team.name.toLowerCase().includes(query) ||
        (team.acronym ?? '').toLowerCase().includes(query),
    );
  });

  const warnings = $derived(
    describeSingleMatchWarnings(homeTeam, awayTeam, board?.meetings ?? [], isPlayoff),
  );

  const roundLabel = $derived.by(() => {
    if (isPlayoff) return playoffRound != null ? formatPlayoffRound(playoffRound) : 'Playoff round';
    return weekNo ? `Week ${weekNo}` : 'Week';
  });

  const canSave = $derived(
    Boolean(
      homeTeam &&
      awayTeam &&
      homeTeam.id !== awayTeam.id &&
      currentSeason &&
      (isPlayoff ? playoffRound != null && mapBanPoolId : Number(weekNo) >= 1) &&
      !isSaving,
    ),
  );

  const publishDescription = $derived.by(() => {
    const byeNames = [homeTeam, awayTeam].filter((team) => team?.onBye).map((team) => team!.name);
    if (!isPlayoff && byeNames.length > 0) {
      return `This creates one live match and notifies both teams. ${byeNames.join(' and ')} will no longer have a bye this week.`;
    }
    return 'This creates one live match and notifies both teams. Players will see it immediately.';
  });

  function clearTeams() {
    patch({ homeTeamId: null, awayTeamId: null });
    teamQuery = '';
    boardOverride = null;
  }

  async function requestBoard() {
    const week = Number(weekNo);
    const ready =
      selectedRegionId &&
      selectedDivisionId &&
      currentSeason &&
      (isPlayoff ? playoffRound != null : Number.isInteger(week) && week >= 1);
    if (!ready) {
      boardOverride = null;
      isLoadingBoard = false;
      return;
    }
    isLoadingBoard = true;
    boardOverride = null;
    await tick();
    boardForm?.requestSubmit();
  }

  function scheduleBoardLoad() {
    clearTimeout(boardTimer);
    boardTimer = setTimeout(() => {
      void requestBoard();
    }, 300);
  }

  const handleBoardEnhance: SubmitFunction = () => {
    isLoadingBoard = true;
    return async ({ result }) => {
      isLoadingBoard = false;
      if (result.type === 'success' && result.data && 'board' in result.data) {
        const next = result.data.board as SingleMatchBoard;
        patch({
          homeTeamId:
            homeTeamId != null && next.teams.some((team) => team.id === homeTeamId)
              ? homeTeamId
              : null,
          awayTeamId:
            awayTeamId != null && next.teams.some((team) => team.id === awayTeamId)
              ? awayTeamId
              : null,
        });
        boardOverride = next;
        return;
      }
      if (result.type === 'failure') {
        const error =
          result.data && typeof result.data === 'object' && 'error' in result.data
            ? String(result.data.error)
            : 'Failed to load teams';
        toast.error(error);
      }
    };
  };

  const handleSaveEnhance: SubmitFunction = () => {
    isSaving = true;
    return async ({ result, update }) => {
      if (result.type === 'failure') {
        const action = pendingAction;
        isSaving = false;
        pendingAction = null;
        const error =
          result.data && typeof result.data === 'object' && 'error' in result.data
            ? String(result.data.error)
            : action === 'publish'
              ? 'Failed to publish match'
              : 'Failed to save draft';
        toast.error(error);
      } else if (result.type !== 'redirect') {
        isSaving = false;
        pendingAction = null;
      }
      await update();
    };
  };

  function pickTeam(team: SingleMatchBoardTeam) {
    if (team.id === blockedTeamId) return;
    if (activeSlot === 'home') {
      patch({ homeTeamId: team.id });
      activeSlot = awayTeamId ? 'home' : 'away';
    } else {
      patch({ awayTeamId: team.id });
      activeSlot = homeTeamId ? 'away' : 'home';
    }
  }

  function swapSides() {
    patch({ homeTeamId: awayTeamId, awayTeamId: homeTeamId });
  }

  function teamRecord(team: SingleMatchBoardTeam) {
    const tag = team.acronym ? `${team.acronym} · ` : '';
    return `${tag}${team.wins}W-${team.losses}L`;
  }
</script>

{#snippet teamSlot(side: 'home' | 'away', team: SingleMatchBoardTeam | null)}
  <button
    type="button"
    class="w-full rounded-lg border px-4 py-3 text-left transition-colors {activeSlot === side
      ? 'border-primary-600 bg-primary-600/10'
      : 'border-border-default bg-surface-input/40 hover:bg-surface-hover'}"
    aria-pressed={activeSlot === side}
    onclick={() => (activeSlot = side)}
  >
    <div class="text-xs font-medium uppercase tracking-wide text-text-muted">
      {side === 'home' ? 'Home' : 'Away'}
    </div>
    {#if team}
      <div class="mt-1 font-semibold text-white">{team.name}</div>
      <div class="text-xs text-text-body">{teamRecord(team)}</div>
    {:else}
      <div class="mt-1 text-text-body">Choose {side} team</div>
    {/if}
  </button>
{/snippet}

<div class="mx-auto max-w-6xl space-y-6">
  <div>
    <a href={resolve('/admin/matches')} class="text-sm text-text-muted hover:text-white"
      >← Match Management</a
    >
    <h1 class="mt-2 mb-2 text-3xl font-bold text-white">
      {data.draft ? 'Edit match' : 'New match'}
    </h1>
    <p class="text-text-body">
      Schedule one match. The rest of the division stays as it is. Moderators save a draft, and an
      admin publishes it before the teams are notified.
    </p>
  </div>

  <form method="POST" action="?/saveDraft" use:enhance={handleSaveEnhance}>
    {#if data.draft}
      <input type="hidden" name="draftId" value={data.draft.id} />
    {/if}
    <input type="hidden" name="regionId" value={selectedRegionId ?? ''} />
    <input type="hidden" name="divisionId" value={selectedDivisionId ?? ''} />
    <input type="hidden" name="isPlayoff" value={isPlayoff ? 'on' : ''} />
    <input type="hidden" name="weekNo" value={isPlayoff ? '' : weekNo} />
    <input type="hidden" name="playoffRound" value={isPlayoff ? (playoffRound ?? '') : ''} />
    <input type="hidden" name="homeTeamId" value={homeTeamId ?? ''} />
    <input type="hidden" name="awayTeamId" value={awayTeamId ?? ''} />
    <input type="hidden" name="boSeries" value={boSeries} />
    <input type="hidden" name="boGames" value={boGames} />
    <input type="hidden" name="arenaId" value={selectedArenaId ?? ''} />
    <input type="hidden" name="mapBanPoolId" value={mapBanPoolId ?? ''} />
    <input type="hidden" name="matchDateTime" value={matchDateTime} />
    <input type="hidden" name="matchTimezone" value={matchTimezone} />

    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.85fr)]">
      <Card padding="lg">
        <label class="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            class="rounded border-border-input bg-surface-input"
            checked={isPlayoff}
            onchange={(event) => {
              patch({ isPlayoff: event.currentTarget.checked });
              clearTeams();
              void requestBoard();
            }}
          />
          <span class="text-text-label">Playoff match</span>
        </label>

        <FormSelect
          label="Format"
          name="formatId"
          value={String(selectedFormatId ?? '')}
          required
          placeholder="Select format"
          options={formatOptions}
          onChange={(value) => {
            patch({
              formatId: value ? parseInt(value) : null,
              regionId: null,
              divisionId: null,
            });
            clearTeams();
          }}
        />
        <FormSelect
          label="Region"
          name="regionPicker"
          value={String(selectedRegionId ?? '')}
          required
          disabled={!selectedFormatId}
          placeholder={selectedFormatId ? 'Select region' : 'Select format first'}
          options={regionsForSelectedFormat.map((region) => ({
            value: String(region.id),
            label: region.name,
          }))}
          onChange={(value) => {
            patch({
              regionId: value ? parseInt(value) : null,
              divisionId: null,
            });
            clearTeams();
          }}
        />

        {#if selectedFormatId && selectedRegionId}
          {#if currentSeason}
            <p class="-mt-2 mb-4 text-sm text-text-body">
              Current season:
              <span class="font-semibold text-white">Season {currentSeason.seasonNum}</span>
            </p>
          {:else}
            <p class="-mt-2 mb-4 text-sm text-warning-400">
              No current season for this format and region. Set the active season in Global
              settings.
            </p>
          {/if}
        {/if}

        <FormSelect
          label="Division"
          name="divisionPicker"
          value={String(selectedDivisionId ?? '')}
          required
          disabled={!selectedRegionId || !currentSeason}
          placeholder={selectedRegionId ? 'Select division' : 'Select region first'}
          options={divisionsForScope.map((division) => ({
            value: String(division.id),
            label: division.name,
          }))}
          onChange={(value) => {
            patch({
              divisionId: value ? parseInt(value) : null,
              homeTeamId: null,
              awayTeamId: null,
            });
            void requestBoard();
          }}
        />

        {#if isPlayoff}
          <FormSelect
            label="Playoff round"
            name="playoffRoundPicker"
            value={String(playoffRound ?? '')}
            required
            disabled={!selectedSeasonPlayoff}
            placeholder={selectedSeasonPlayoff ? 'Select round' : 'No playoff configured'}
            options={playoffRounds}
            onChange={(value) => {
              patch({ playoffRound: value ? parseInt(value) : null });
              void requestBoard();
            }}
          />
        {:else}
          <FormInput
            label="Week"
            name="weekNumber"
            type="number"
            compact
            required
            min={1}
            max={currentSeason?.numWeeks}
            disabled={!currentSeason}
            value={weekNo}
            placeholder={currentSeason ? `1–${currentSeason.numWeeks}` : 'No current season'}
            hint={currentSeason ? `Season has ${currentSeason.numWeeks} weeks` : undefined}
            onInput={(value) => {
              patch({ weekNo: value ?? '' });
              scheduleBoardLoad();
            }}
          />
        {/if}

        {#if board}
          <div class="mt-2 space-y-4">
            <div class="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              {@render teamSlot('home', homeTeam)}
              <Button type="button" variant="ghost" size="sm" onclick={swapSides}>Swap</Button>
              {@render teamSlot('away', awayTeam)}
            </div>

            <FormInput
              label={activeSlot === 'home' ? 'Search home team' : 'Search away team'}
              name="teamQuery"
              compact
              bind:value={teamQuery}
              placeholder="Name or tag"
            />

            <div class="max-h-80 space-y-2 overflow-y-auto" aria-busy={isLoadingBoard}>
              {#if isLoadingBoard}
                <p class="text-sm text-text-muted">Loading teams…</p>
              {:else if board.teams.length === 0}
                <p class="text-sm text-text-body">
                  No ready teams in this division. A team has to be READY, and paid when the season
                  requires it, before it can be scheduled.
                </p>
              {:else if visibleTeams.length === 0}
                <p class="text-sm text-text-body">No teams match that search.</p>
              {:else}
                {#each visibleTeams as team (team.id)}
                  {@const selected = team.id === homeTeamId || team.id === awayTeamId}
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 {selected
                      ? 'border-primary-600 bg-primary-600/10'
                      : 'border-border-input bg-surface-input/40 hover:bg-surface-hover'}"
                    disabled={team.id === blockedTeamId}
                    onclick={() => pickTeam(team)}
                  >
                    <span>
                      <span class="block font-semibold text-white">{team.name}</span>
                      <span class="block text-xs text-text-body">{teamRecord(team)}</span>
                    </span>
                    <span class="flex shrink-0 gap-1">
                      {#if team.id === homeTeamId}
                        <Badge color="orange">Home</Badge>
                      {:else if team.id === awayTeamId}
                        <Badge color="zinc">Away</Badge>
                      {/if}
                      {#if team.scheduledThisRound}
                        <Badge color="yellow">Scheduled</Badge>
                      {/if}
                      {#if team.onBye}
                        <Badge>Bye</Badge>
                      {/if}
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {:else if isLoadingBoard}
          <p class="text-sm text-text-muted">Loading teams…</p>
        {:else}
          <p class="text-sm text-text-muted">
            Choose a division and {isPlayoff ? 'round' : 'week'} to see the teams that can play.
          </p>
        {/if}
      </Card>

      <Card padding="lg" class="lg:sticky lg:top-4">
        <h2 class="mb-1 text-lg font-bold text-white">
          {homeTeam && awayTeam ? `${homeTeam.name} vs ${awayTeam.name}` : 'Match details'}
        </h2>
        <p class="mb-4 text-sm text-text-body">
          {roundLabel}
          {#if currentSeason}
            · Season {currentSeason.seasonNum}
          {/if}
          · BO{boSeries}
        </p>

        <FormSelect
          label="Best of series"
          name="boSeriesPicker"
          value={boSeries}
          onChange={(value) => patch({ boSeries: value })}
          required
          options={[
            { value: '1', label: '1' },
            { value: '3', label: '3' },
            { value: '5', label: '5' },
            { value: '7', label: '7' },
          ]}
        />
        {#if isPlayoff}
          <FormSelect
            label="Best of games (per arena)"
            name="boGamesPicker"
            value={boGames}
            placeholder="Default (1 game per arena)"
            options={[
              { value: '1', label: '1' },
              { value: '3', label: '3' },
              { value: '5', label: '5' },
              { value: '7', label: '7' },
            ]}
            onChange={(value) => patch({ boGames: value })}
          />
          <FormSelect
            label="Map ban pool"
            name="mapPoolPicker"
            value={String(mapBanPoolId ?? '')}
            required
            placeholder="Select map ban pool"
            options={data.mapBanPools
              .filter((pool) => pool.isActive)
              .map((pool) => ({ value: String(pool.id), label: pool.name }))}
            onChange={(value) => patch({ mapBanPoolId: value ? parseInt(value) : null })}
          />
        {/if}
        <FormSelect
          label="Arena"
          name="arenaPicker"
          value={String(selectedArenaId ?? '')}
          placeholder="No default arena"
          hint="Optional"
          options={data.arenas.map((arena) => ({ value: String(arena.id), label: arena.name }))}
          onChange={(value) => patch({ arenaId: value ? parseInt(value) : null })}
        />
        {#if !isPlayoff}
          <FormSelect
            label="Map ban pool"
            name="mapPoolPickerRegular"
            value={String(mapBanPoolId ?? '')}
            placeholder="No map ban"
            hint="Optional"
            options={data.mapBanPools
              .filter((pool) => pool.isActive)
              .map((pool) => ({ value: String(pool.id), label: pool.name }))}
            onChange={(value) => patch({ mapBanPoolId: value ? parseInt(value) : null })}
          />
        {/if}
        <FormInput
          label="Match date and time"
          name="matchDateTime"
          type="datetime-local"
          compact
          value={matchDateTime}
          onInput={(value) => patch({ matchDateTime: value ?? '' })}
          hint="Optional. Enter it in the timezone below."
        />
        <FormSelect
          label="Timezone"
          name="matchTimezone"
          value={matchTimezone}
          onChange={(value) => patch({ matchTimezone: value })}
          options={TIMEZONES}
        />

        {#if warnings.length > 0}
          <div class="mb-4 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
            <ul class="space-y-1 text-sm text-warning-300">
              {#each warnings as warning (warning)}
                <li>{warning}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="flex flex-col gap-3">
          <Button
            variant="secondary"
            type="submit"
            disabled={!canSave}
            onclick={() => (pendingAction = 'save')}
          >
            {isSaving && pendingAction === 'save' ? 'Saving...' : 'Save draft'}
          </Button>
          {#if isStrictAdmin}
            <Button
              variant="success"
              type="button"
              disabled={!canSave}
              onclick={() => (confirmPublish = true)}
            >
              Publish match
            </Button>
            <button
              type="submit"
              class="hidden"
              formaction="?/publishMatch"
              formmethod="POST"
              disabled={pendingAction !== 'publish'}
              {@attach (node) => {
                publishButton = node;
              }}
            >
              Publish match
            </button>
          {:else}
            <p class="text-xs text-text-muted">
              Moderators can save this draft. An admin has to publish it before players see the
              match.
            </p>
          {/if}
        </div>
      </Card>
    </div>
  </form>
</div>

<form
  method="POST"
  action="?/loadBoard"
  class="hidden"
  {@attach (node) => {
    boardForm = node;
  }}
  use:enhance={handleBoardEnhance}
>
  <input name="regionId" value={selectedRegionId ?? ''} />
  <input name="divisionId" value={selectedDivisionId ?? ''} />
  <input name="isPlayoff" value={isPlayoff ? 'on' : ''} />
  <input name="weekNo" value={isPlayoff ? '' : weekNo} />
  <input name="playoffRound" value={isPlayoff ? (playoffRound ?? '') : ''} />
</form>

<ConfirmDialog
  open={confirmPublish}
  title="Publish this match"
  description={publishDescription}
  confirmLabel="Publish"
  variant="success"
  isLoading={isSaving}
  onConfirm={() => {
    confirmPublish = false;
    pendingAction = 'publish';
    void tick().then(() => publishButton?.click());
  }}
  onCancel={() => (confirmPublish = false)}
/>
