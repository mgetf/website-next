<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import type { Column } from '$lib/components/ui/DataTable.svelte';
  import type { TournamentEditorListItem } from '$lib/types/tournament-editor';
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let name = $state('');
  let type = $state('CUP');
  let creating = $state(false);
  let importing = $state(false);

  const columns: Column[] = [
    { key: 'name', label: 'Tournament' },
    { key: 'state', label: 'State' },
    { key: 'content', label: 'Content' },
    { key: 'issues', label: 'Issues', align: 'center' },
    { key: 'actions', label: 'Actions', align: 'right', srOnly: true },
  ];

  const typeOptions = [
    { value: 'CUP', label: 'Cup' },
    { value: 'CHAMPIONSHIP', label: 'Championship' },
    { value: 'FIGHT_NIGHT', label: 'Fight Night' },
  ];

  function formatDate(value: string | null): string {
    if (!value) return 'Not scheduled';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  }

  function typeLabel(typeValue: TournamentEditorListItem['type']): string {
    if (typeValue === 'FIGHT_NIGHT') return 'Fight Night';
    if (typeValue === 'CHAMPIONSHIP') return 'Championship';
    return 'Cup';
  }
</script>

<svelte:head>
  <title>Tournament Editor - Admin - MGE.tf</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-8">
  <header>
    <h1 class="text-3xl font-bold text-white">Tournament Editor</h1>
    <p class="mt-2 text-text-body">
      Create drafts, review validation issues, and publish tournament brackets.
    </p>
  </header>

  <FormError error={form?.error} success={form?.success && form?.message ? form.message : null} />

  <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
    <Card>
      <h2 class="mb-5 text-xl font-semibold text-white">New draft</h2>
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          creating = true;
          return async ({ update }) => {
            await update();
            creating = false;
          };
        }}
      >
        <FormInput
          label="Tournament name"
          name="name"
          bind:value={name}
          required
          maxlength={160}
          placeholder="Summer Cup 2026"
        />
        <FormSelect
          label="Tournament type"
          name="type"
          bind:value={type}
          options={typeOptions}
          required
        />
        <Button type="submit" variant="primary" disabled={creating}>
          {creating ? 'Creating...' : 'Create draft'}
        </Button>
      </form>
    </Card>

    <Card>
      <h2 class="text-xl font-semibold text-white">Historical tournaments</h2>
      <p class="my-4 text-sm text-text-body">
        Create editable drafts for published tournaments that do not have one yet.
      </p>
      <form
        method="POST"
        action="?/importHistorical"
        use:enhance={() => {
          importing = true;
          return async ({ update }) => {
            await update();
            importing = false;
          };
        }}
      >
        <Button type="submit" variant="secondary" disabled={importing}>
          {importing ? 'Importing...' : 'Import historical drafts'}
        </Button>
      </form>
    </Card>
  </div>

  <section aria-labelledby="tournament-list-heading">
    <div class="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 id="tournament-list-heading" class="text-xl font-semibold text-white">Tournaments</h2>
        <p class="mt-1 text-sm text-text-muted">{data.tournaments.length} total records</p>
      </div>
    </div>

    <DataTable
      data={data.tournaments}
      {columns}
      emptyMessage="No tournament drafts or published tournaments found"
      emptyIcon="🏆"
    >
      {#snippet cell(tournament, column)}
        {#if column.key === 'name'}
          <div>
            <p class="font-semibold text-white">{tournament.name}</p>
            <p class="mt-1 text-xs text-text-muted">
              {typeLabel(tournament.type)} · {formatDate(tournament.startedAt)}
            </p>
          </div>
        {:else if column.key === 'state'}
          <div class="flex flex-wrap gap-2">
            {#if tournament.eventId}
              <Badge color="green">Published</Badge>
            {:else}
              <Badge color="yellow">Draft only</Badge>
            {/if}
            {#if tournament.draftId}
              <Badge color="orange">Draft r{tournament.draftRevision}</Badge>
            {:else}
              <Badge color="zinc">No draft</Badge>
            {/if}
          </div>
        {:else if column.key === 'content'}
          <div class="text-sm text-text-body">
            <span>{tournament.stageCount} stages</span>
            <span class="mx-1 text-text-muted">·</span>
            <span>{tournament.matchCount} matches</span>
          </div>
        {:else if column.key === 'issues'}
          <Badge color={tournament.validationIssues > 0 ? 'yellow' : 'green'}>
            {tournament.validationIssues}
          </Badge>
        {:else if column.key === 'actions'}
          <div class="flex justify-end gap-2">
            {#if tournament.eventId}
              <Button
                variant="ghost"
                size="sm"
                href="/tournaments/{tournament.eventId}"
                aria-label="View published tournament {tournament.name}"
              >
                View
              </Button>
            {/if}
            {#if tournament.draftId}
              <Button
                variant="primary"
                size="sm"
                href="/admin/tournaments/{tournament.draftId}"
                aria-label="Edit tournament draft {tournament.name}"
              >
                Edit
              </Button>
            {:else if tournament.eventId}
              <form method="POST" action="?/clone">
                <input type="hidden" name="eventId" value={tournament.eventId} />
                <Button
                  variant="secondary"
                  size="sm"
                  type="submit"
                  aria-label="Create draft for {tournament.name}"
                >
                  Create draft
                </Button>
              </form>
            {/if}
          </div>
        {/if}
      {/snippet}
    </DataTable>
  </section>
</div>
