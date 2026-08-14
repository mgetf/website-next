<script lang="ts">
  import type { PageData } from './$types';
  import type { EventListItem } from '$lib/types/event';
  import { resolve } from '$app/paths';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';

  let { data }: { data: PageData } = $props();

  let activeTab = $state<'cups' | 'championships' | 'fightnights'>('cups');

  const cups = $derived(data.events.filter((e) => e.type === 'CUP'));
  const championships = $derived(data.events.filter((e) => e.type === 'CHAMPIONSHIP'));
  const fightNights = $derived(data.events.filter((e) => e.type === 'FIGHT_NIGHT'));

  const cupsColumns = [
    { key: 'name', label: 'Tournament' },
    { key: 'date', label: 'Date' },
    { key: 'format', label: 'Format' },
    { key: 'winner', label: 'Winner' },
    { key: 'bracket', label: 'Bracket' },
  ];

  const championshipsColumns = [
    { key: 'name', label: 'Championship' },
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'participants', label: 'Participants' },
    { key: 'champion', label: 'Champion' },
  ];

  const fightNightsColumns = [
    { key: 'name', label: 'Event' },
    { key: 'date', label: 'Date' },
    { key: 'matchups', label: 'Matchups' },
    { key: 'prize', label: 'Prize Pool' },
  ];

  function formatDate(iso: string | null): string {
    if (!iso) return 'TBD';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'TBD';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'TBD';
    }
  }

  function getWinner(event: EventListItem) {
    return event.placements.find((p) => p.placement === 1);
  }

  function getStatusColor(status: string): 'green' | 'yellow' | 'blue' | 'zinc' {
    if (status === 'REGISTRATION') return 'yellow';
    if (status === 'IN_PROGRESS') return 'blue';
    if (status === 'COMPLETED') return 'green';
    return 'zinc';
  }

  function getStatusLabel(status: string): string {
    if (status === 'REGISTRATION') return 'Registration';
    if (status === 'IN_PROGRESS') return 'In Progress';
    if (status === 'COMPLETED') return 'Completed';
    return 'Upcoming';
  }
</script>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div>
      <h1 class="text-5xl font-black text-white mb-2">Tournaments</h1>
      <p class="text-xl text-text-body">
        Browse all historic MGE.tf tournaments and competitive events
      </p>
    </div>
  </PageHero>

  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <!-- Tab Navigation -->
    <div class="border-b border-border-default mb-8">
      <nav class="flex space-x-8">
        <button
          onclick={() => (activeTab = 'cups')}
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'cups'
            ? 'border-primary-600 text-primary-500'
            : 'border-transparent text-text-body hover:text-text-label hover:border-text-muted'}"
        >
          Cups
          <span
            class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'cups'
              ? 'bg-primary-600/20 text-primary-400'
              : 'bg-surface-input text-text-muted'}"
          >
            {cups.length}
          </span>
        </button>

        <button
          onclick={() => (activeTab = 'championships')}
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab ===
          'championships'
            ? 'border-primary-600 text-primary-500'
            : 'border-transparent text-text-body hover:text-text-label hover:border-text-muted'}"
        >
          World Championships
          <span
            class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'championships'
              ? 'bg-primary-600/20 text-primary-400'
              : 'bg-surface-input text-text-muted'}"
          >
            {championships.length}
          </span>
        </button>

        <button
          onclick={() => (activeTab = 'fightnights')}
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab ===
          'fightnights'
            ? 'border-primary-600 text-primary-500'
            : 'border-transparent text-text-body hover:text-text-label hover:border-text-muted'}"
        >
          Fight Nights
          <span
            class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'fightnights'
              ? 'bg-primary-600/20 text-primary-400'
              : 'bg-surface-input text-text-muted'}"
          >
            {fightNights.length}
          </span>
        </button>
      </nav>
    </div>

    <!-- Cups Tab -->
    {#if activeTab === 'cups'}
      <DataTable data={cups} columns={cupsColumns} emptyMessage="No Cups Yet" emptyIcon="🏆">
        {#snippet cell(event, col)}
          {#if col.key === 'name'}
            <a
              href={resolve('/tournaments/[id]', { id: String(event.id) })}
              class="flex items-center space-x-3 whitespace-nowrap group"
            >
              {#if event.avatar}
                <img src={event.avatar} alt={event.name} class="w-12 h-12 rounded object-cover" />
              {:else}
                <div
                  class="w-12 h-12 rounded bg-surface-input flex items-center justify-center text-2xl"
                >
                  🏆
                </div>
              {/if}
              <div class="flex-1">
                <div
                  class="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors"
                >
                  {event.name}
                </div>
                {#if event.description}
                  <div class="text-xs text-text-muted line-clamp-1 max-w-xs">
                    {event.description}
                  </div>
                {/if}
              </div>
            </a>
          {:else if col.key === 'date'}
            <div class="text-sm text-text-body whitespace-nowrap">
              {formatDate(event.startedAt)}
            </div>
          {:else if col.key === 'format'}
            {#if event.isTeamEvent}
              <Badge color="purple">2v2</Badge>
            {:else}
              <Badge color="blue">1v1</Badge>
            {/if}
          {:else if col.key === 'winner'}
            {@const winner = getWinner(event)}
            {#if winner?.user}
              <a
                href={resolve('/users/[steamId]', { steamId: winner.user.steamId })}
                class="flex items-center space-x-2 group/winner whitespace-nowrap"
              >
                <img
                  src={winner.user.steamAvatar || '/default-avatar.png'}
                  alt={winner.user.steamUsername}
                  class="w-8 h-8 rounded-full"
                />
                <span
                  class="text-sm text-white font-semibold group-hover/winner:text-primary-400 transition-colors"
                >
                  {winner.user.steamUsername}
                </span>
              </a>
            {:else if winner}
              <span class="text-sm font-semibold text-white">{winner.displayName}</span>
            {:else}
              <span class="text-sm text-text-muted">—</span>
            {/if}
          {:else if col.key === 'bracket'}
            <div class="flex items-center gap-3 whitespace-nowrap">
              {#if event.stageCount > 0}
                <a
                  href={resolve('/tournaments/[id]', { id: String(event.id) })}
                  class="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  View Bracket →
                </a>
              {:else if event.bracketLink}
                <Button
                  href={event.bracketLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  size="sm"
                >
                  External →
                </Button>
              {:else}
                <span class="text-sm text-text-muted">—</span>
              {/if}
            </div>
          {/if}
        {/snippet}
      </DataTable>
    {/if}

    <!-- World Championships Tab -->
    {#if activeTab === 'championships'}
      <DataTable
        data={championships}
        columns={championshipsColumns}
        emptyMessage="No Championships Yet"
        emptyIcon="🌍"
      >
        {#snippet cell(event, col)}
          {#if col.key === 'name'}
            <a
              href={resolve('/tournaments/[id]', { id: String(event.id) })}
              class="flex items-center space-x-3 whitespace-nowrap group"
            >
              {#if event.avatar}
                <img src={event.avatar} alt={event.name} class="w-12 h-12 rounded object-cover" />
              {:else}
                <div
                  class="w-12 h-12 rounded bg-linear-to-br from-surface-hover to-surface-card flex items-center justify-center text-2xl"
                >
                  🌍
                </div>
              {/if}
              <div>
                <div
                  class="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors"
                >
                  {event.name}
                </div>
              </div>
            </a>
          {:else if col.key === 'date'}
            <div class="whitespace-nowrap">
              <div class="text-sm text-text-body">
                {formatDate(event.startedAt)}
              </div>
              {#if event.endedAt}
                <div class="text-xs text-text-muted">
                  Ended: {formatDate(event.endedAt)}
                </div>
              {/if}
            </div>
          {:else if col.key === 'status'}
            <Badge color={getStatusColor(event.status)}>
              {getStatusLabel(event.status)}
            </Badge>
          {:else if col.key === 'participants'}
            <div class="whitespace-nowrap">
              <div class="text-sm text-text-body">
                {event.participantCount} Players
              </div>
              {#if event.matchCount}
                <div class="text-xs text-text-muted">
                  {event.matchCount} Matches
                </div>
              {/if}
            </div>
          {:else if col.key === 'champion'}
            {@const winner = getWinner(event)}
            {#if winner?.user}
              <a
                href={resolve('/users/[steamId]', { steamId: winner.user.steamId })}
                class="flex items-center space-x-2 group/winner whitespace-nowrap"
              >
                <img
                  src={winner.user.steamAvatar || '/default-avatar.png'}
                  alt={winner.user.steamUsername}
                  class="w-8 h-8 rounded-full"
                />
                <span
                  class="text-sm text-white font-semibold group-hover/winner:text-primary-400 transition-colors"
                >
                  {winner.user.steamUsername}
                </span>
              </a>
            {:else if winner}
              <span class="text-sm font-semibold text-white">{winner.displayName}</span>
            {:else if event.status === 'REGISTRATION'}
              <span class="text-sm text-primary-400">Open</span>
            {:else}
              <span class="text-sm text-text-muted">TBD</span>
            {/if}
          {/if}
        {/snippet}
      </DataTable>
    {/if}

    <!-- Fight Nights Tab -->
    {#if activeTab === 'fightnights'}
      <DataTable
        data={fightNights}
        columns={fightNightsColumns}
        emptyMessage="No Fight Nights Yet"
        emptyIcon="🥊"
      >
        {#snippet cell(event, col)}
          {#if col.key === 'name'}
            <a
              href={resolve('/tournaments/[id]', { id: String(event.id) })}
              class="flex items-center space-x-3 whitespace-nowrap group"
            >
              {#if event.avatar}
                <img
                  src={event.avatar}
                  alt={event.name}
                  class="w-12 h-12 rounded object-cover shrink-0"
                />
              {:else}
                <div
                  class="w-12 h-12 rounded bg-linear-to-br from-danger-900/30 to-surface-card flex items-center justify-center text-2xl shrink-0"
                >
                  🥊
                </div>
              {/if}
              <div>
                <div
                  class="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors"
                >
                  {event.name}
                </div>
                {#if event.description}
                  <div class="text-xs text-text-muted line-clamp-1 max-w-xs">
                    {event.description}
                  </div>
                {/if}
              </div>
            </a>
          {:else if col.key === 'date'}
            <div class="text-sm text-text-body whitespace-nowrap">
              {formatDate(event.startedAt)}
            </div>
          {:else if col.key === 'matchups'}
            <div class="text-sm text-text-body whitespace-nowrap">
              {event.matchCount}
              {event.matchCount === 1 ? 'Fight' : 'Fights'}
            </div>
          {:else if col.key === 'prize'}
            {#if event.prizepool > 0}
              <Badge color="green">${event.prizepool}</Badge>
            {:else}
              <span class="text-sm text-text-muted">—</span>
            {/if}
          {/if}
        {/snippet}
      </DataTable>
    {/if}
  </div>
</div>
