<script lang="ts">
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { BracketData } from '$lib/types/bracket';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import BracketRenderer from '$lib/components/brackets/BracketRenderer.svelte';

  let { data }: { data: PageData } = $props();

  const event = $derived(data.event);
  const brackets = $derived(data.brackets);

  let activeStageIdx = $state(0);

  const typeBadge = $derived(
    event.type === 'CUP'
      ? { color: 'blue' as const, label: event.isTeamEvent ? '2v2 Cup' : '1v1 Cup' }
      : event.type === 'CHAMPIONSHIP'
        ? { color: 'purple' as const, label: 'World Championship' }
        : { color: 'orange' as const, label: 'Fight Night' },
  );

  function statusColor(status: string): 'green' | 'yellow' | 'blue' | 'zinc' {
    if (status === 'COMPLETED') return 'green';
    if (status === 'IN_PROGRESS') return 'blue';
    if (status === 'REGISTRATION') return 'yellow';
    return 'zinc';
  }

  function statusLabel(status: string): string {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'IN_PROGRESS') return 'In Progress';
    if (status === 'REGISTRATION') return 'Registration';
    return 'Upcoming';
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'TBD';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'TBD';
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return 'TBD';
    }
  }

  function bracketHasContent(bracket: BracketData): boolean {
    if (bracket.rounds.some((round) => round.matches.length > 0)) return true;
    if (bracket.format === 'round_robin') return bracket.standings.length > 0;
    if (bracket.format !== 'double_elim') return false;

    return (
      bracket.loserRounds?.some((round) => round.matches.length > 0) === true ||
      (bracket.grandFinal?.matches.length ?? 0) > 0
    );
  }

  function stageTabId(stageId: number): string {
    return `tournament-stage-tab-${stageId}`;
  }

  function stagePanelId(stageId: number): string {
    return `tournament-stage-panel-${stageId}`;
  }

  function selectStage(index: number, focusTab = false) {
    const bracket = brackets[index];
    if (!bracket) return;

    activeStageIdx = index;
    if (focusTab) {
      requestAnimationFrame(() => document.getElementById(stageTabId(bracket.stageId))?.focus());
    }
  }

  function onStageTabKeydown(event: KeyboardEvent, index: number) {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % brackets.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + brackets.length) % brackets.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = brackets.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    selectStage(nextIndex, true);
  }

  const placementMedals = ['🥇', '🥈', '🥉'];
</script>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" href="/tournaments">← Tournaments</Button>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-start gap-5">
        {#if event.avatar}
          <img
            src={event.avatar}
            alt={event.name}
            class="w-20 h-20 rounded-lg object-cover shrink-0"
          />
        {:else}
          <div
            class="w-20 h-20 rounded-lg bg-surface-input flex items-center justify-center text-4xl shrink-0"
          >
            {event.type === 'FIGHT_NIGHT' ? '🥊' : event.type === 'CHAMPIONSHIP' ? '🌍' : '🏆'}
          </div>
        {/if}
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <Badge color={typeBadge.color}>{typeBadge.label}</Badge>
            <Badge color={statusColor(event.status)}>{statusLabel(event.status)}</Badge>
            {#if event.prizepool > 0}
              <Badge color="green">${event.prizepool}</Badge>
            {/if}
          </div>
          <h1 class="text-4xl font-black text-white mb-1">{event.name}</h1>
          <div class="flex flex-wrap items-center gap-4 text-text-body text-sm">
            <span>{formatDate(event.startedAt)}</span>
            {#if event.participantCount > 0}
              <span>{event.participantCount} participants</span>
            {/if}
            {#if event.stages.length > 0}
              <span>{event.stages.reduce((sum, s) => sum + s.matchCount, 0)} matches</span>
            {/if}
          </div>
          {#if event.description}
            <p class="text-text-body mt-3 max-w-2xl">{event.description}</p>
          {/if}
        </div>
      </div>
    </div>
  </PageHero>

  <div class="container mx-auto px-4 py-8 max-w-7xl space-y-8">
    <!-- Placements -->
    {#if event.placements.length > 0}
      <Card>
        <h2 class="text-lg font-bold text-white mb-4">Results</h2>
        <div class="flex flex-wrap gap-6">
          {#each event.placements.slice(0, 3) as placement, i (placement.id)}
            <div class="flex items-center gap-3">
              <span class="text-2xl">{placementMedals[i] ?? `#${placement.placement}`}</span>
              {#if placement.user}
                <a
                  href={resolve('/users/[steamId]', { steamId: placement.user.steamId })}
                  class="flex items-center gap-2 group"
                >
                  <img
                    src={placement.user.steamAvatar || '/default-avatar.png'}
                    alt={placement.user.steamUsername}
                    class="w-10 h-10 rounded-full"
                  />
                  <span
                    class="text-white font-semibold group-hover:text-primary-400 transition-colors"
                  >
                    {placement.user.steamUsername}
                  </span>
                </a>
              {:else}
                <span class="font-semibold text-white">{placement.displayName}</span>
              {/if}
            </div>
          {/each}
        </div>
      </Card>
    {/if}

    {#snippet bracketFallback(message: string)}
      <Card>
        <div class="py-8 text-center">
          <p class="text-text-body {event.bracketLink ? 'mb-4' : ''}">{message}</p>
          {#if event.bracketLink}
            <Button
              variant="primary"
              href={event.bracketLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              View External Bracket →
            </Button>
          {/if}
        </div>
      </Card>
    {/snippet}

    <!-- Bracket(s) -->
    {#if brackets.length > 0}
      {#if brackets.length > 1}
        <div class="border-b border-border-default">
          <div
            class="flex space-x-6"
            role="tablist"
            aria-label="Tournament stages"
            aria-orientation="horizontal"
          >
            {#each brackets as bracket, i (bracket.stageId)}
              <button
                id={stageTabId(bracket.stageId)}
                type="button"
                role="tab"
                aria-selected={activeStageIdx === i}
                aria-controls={stagePanelId(bracket.stageId)}
                tabindex={activeStageIdx === i ? 0 : -1}
                onclick={() => selectStage(i)}
                onkeydown={(event) => onStageTabKeydown(event, i)}
                class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeStageIdx ===
                i
                  ? 'border-primary-600 text-primary-500'
                  : 'border-transparent text-text-body hover:text-text-label hover:border-text-muted'}"
              >
                {bracket.stageName}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div>
        {#if brackets.length > 1}
          {#each brackets as bracket, i (bracket.stageId)}
            <div
              id={stagePanelId(bracket.stageId)}
              role="tabpanel"
              aria-labelledby={stageTabId(bracket.stageId)}
              tabindex="0"
              hidden={i !== activeStageIdx}
            >
              {#if i === activeStageIdx}
                {#if bracketHasContent(bracket.data)}
                  <BracketRenderer data={bracket.data} />
                {:else}
                  {@render bracketFallback('No matches have been published for this stage.')}
                {/if}
              {/if}
            </div>
          {/each}
        {:else}
          <section aria-label={brackets[0].stageName}>
            <h2 class="text-lg font-bold text-white mb-4">{brackets[0].stageName}</h2>
            {#if bracketHasContent(brackets[0].data)}
              <BracketRenderer data={brackets[0].data} />
            {:else}
              {@render bracketFallback('No matches have been published for this stage.')}
            {/if}
          </section>
        {/if}
      </div>
    {:else}
      {@render bracketFallback('Bracket data is not available for this event.')}
    {/if}

    <!-- Participants -->
    {#if event.participants.length > 0}
      <Card>
        <h2 class="text-lg font-bold text-white mb-4">
          Participants ({event.participants.length})
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {#each event.participants as participant (participant.id)}
            {#if participant.user}
              <a
                href={resolve('/users/[steamId]', { steamId: participant.user.steamId })}
                class="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover transition-colors group"
              >
                <img
                  src={participant.user.steamAvatar || '/default-avatar.png'}
                  alt={participant.user.steamUsername}
                  class="w-8 h-8 rounded-full shrink-0"
                />
                <div class="min-w-0">
                  <div
                    class="text-sm text-white font-medium truncate group-hover:text-primary-400 transition-colors"
                  >
                    {participant.user.steamUsername}
                  </div>
                  {#if participant.seed}
                    <div class="text-xs text-text-muted">Seed #{participant.seed}</div>
                  {/if}
                </div>
                {#if participant.eliminated}
                  <Badge color="red" size="sm">Out</Badge>
                {/if}
              </a>
            {:else}
              <div class="flex items-center gap-2 p-2 rounded-lg">
                <div class="min-w-0">
                  <div class="text-sm text-white font-medium truncate">
                    {participant.displayName}
                  </div>
                  {#if participant.seed}
                    <div class="text-xs text-text-muted">Seed #{participant.seed}</div>
                  {/if}
                </div>
                <Badge color="zinc" size="sm">Unlinked</Badge>
              </div>
            {/if}
          {/each}
        </div>
      </Card>
    {/if}
  </div>
</div>
