<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import type { EventListItem } from '$lib/types/event';
  import { enhance } from '$app/forms';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let activeTab = $state<'cups' | 'championships' | 'fightnights'>('cups');
  let showCreateForm = $state(false);
  let isSubmitting = $state(false);

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

<svelte:head>
  <title>Tournaments - MGE.tf</title>
  <meta
    name="description"
    content="Browse all MGE.tf tournaments including Cups, World Championships, and Fight Night events"
  />
</svelte:head>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-5xl font-black text-white mb-2">Tournaments</h1>
        <p class="text-xl text-text-body">
          Browse all historic MGE.tf tournaments and competitive events
        </p>
      </div>
      {#if data.isGlobalAdmin}
        <Button variant="primary" onclick={() => (showCreateForm = !showCreateForm)}>
          {#if showCreateForm}
            Cancel
          {:else}
            + Create Event
          {/if}
        </Button>
      {/if}
    </div>
  </PageHero>

  <div class="container mx-auto px-4 py-8 max-w-7xl">
    {#if form?.error}
      <div class="mb-6 p-4 bg-danger-600/20 border border-danger-600/30 rounded-lg text-danger-400">
        {form.error}
      </div>
    {/if}
    {#if form?.success && form?.message}
      <div
        class="mb-6 p-4 bg-success-600/20 border border-success-600/30 rounded-lg text-success-400"
      >
        {form.message}
      </div>
    {/if}

    {#if data.isGlobalAdmin && showCreateForm}
      <Card class="mb-8">
        <h2 class="text-xl font-bold text-white mb-4">Create New Event</h2>
        <form
          method="POST"
          action="?/create"
          use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
              await update();
              isSubmitting = false;
              showCreateForm = false;
            };
          }}
          class="space-y-4"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="name" class="block text-sm font-medium text-text-label mb-1">
                Event Name <span class="text-danger-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="e.g. Summer Cup 2026"
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
            <div>
              <label for="type" class="block text-sm font-medium text-text-label mb-1">
                Type <span class="text-danger-400">*</span>
              </label>
              <select
                name="type"
                id="type"
                required
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              >
                <option value="CUP">Cup</option>
                <option value="CHAMPIONSHIP">Championship</option>
                <option value="FIGHT_NIGHT">Fight Night</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="startedAt" class="block text-sm font-medium text-text-label mb-1">
                Date
              </label>
              <input
                type="date"
                name="startedAt"
                id="startedAt"
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
            <div>
              <label for="avatar" class="block text-sm font-medium text-text-label mb-1">
                Avatar URL
              </label>
              <input
                type="url"
                name="avatar"
                id="avatar"
                placeholder="https://..."
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label for="description" class="block text-sm font-medium text-text-label mb-1">
              Description
            </label>
            <textarea
              name="description"
              id="description"
              rows="2"
              placeholder="Brief description of the event"
              class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="bracketLink" class="block text-sm font-medium text-text-label mb-1">
                Bracket URL
              </label>
              <input
                type="url"
                name="bracketLink"
                id="bracketLink"
                placeholder="https://challonge.com/..."
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
            <div>
              <label for="card" class="block text-sm font-medium text-text-label mb-1">
                Card Name
              </label>
              <input
                type="text"
                name="card"
                id="card"
                placeholder="e.g. Fight Night II"
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              name="isTeamEvent"
              id="isTeamEvent"
              class="w-4 h-4 rounded bg-surface-input border-border-input text-primary-600 focus:ring-primary-600"
            />
            <label for="isTeamEvent" class="text-sm text-text-body">Team Event (2v2)</label>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onclick={() => (showCreateForm = false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Event'}
            </Button>
          </div>
        </form>
      </Card>
    {/if}

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
              href="/tournaments/{event.id}"
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
                href="/users/{winner.user.steamId}"
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
            {:else}
              <span class="text-sm text-text-muted">—</span>
            {/if}
          {:else if col.key === 'bracket'}
            <div class="flex items-center gap-3 whitespace-nowrap">
              {#if event.stageCount > 0}
                <a
                  href="/tournaments/{event.id}"
                  class="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  View Bracket →
                </a>
              {:else if event.bracketLink}
                <a
                  href={event.bracketLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  External →
                </a>
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
              href="/tournaments/{event.id}"
              class="flex items-center space-x-3 whitespace-nowrap group"
            >
              {#if event.avatar}
                <img src={event.avatar} alt={event.name} class="w-12 h-12 rounded object-cover" />
              {:else}
                <div
                  class="w-12 h-12 rounded bg-gradient-to-br from-purple-900/30 to-surface-card flex items-center justify-center text-2xl"
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
                href="/users/{winner.user.steamId}"
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
              href="/tournaments/{event.id}"
              class="flex items-center space-x-3 whitespace-nowrap group"
            >
              {#if event.avatar}
                <img
                  src={event.avatar}
                  alt={event.name}
                  class="w-12 h-12 rounded object-cover flex-shrink-0"
                />
              {:else}
                <div
                  class="w-12 h-12 rounded bg-gradient-to-br from-red-900/30 to-surface-card flex items-center justify-center text-2xl flex-shrink-0"
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
