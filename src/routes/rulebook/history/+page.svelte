<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type { RulebookRevisionSummary } from '$lib/types/rulebook';
  import { formatDateTime } from '$lib/utils/datetime';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const columns: Column[] = [
    { key: 'version', label: 'Revision', width: '6rem' },
    { key: 'publishedAt', label: 'Published' },
    { key: 'author', label: 'Author' },
    { key: 'message', label: 'Message' },
  ];
</script>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-5xl font-black text-white mb-2">Rulebook history</h1>
        <p class="text-xl text-text-body">Every published change to the league rules</p>
      </div>
      <Button variant="secondary" size="sm" href="/rulebook">Back to rulebook</Button>
    </div>
  </PageHero>

  <div class="max-w-7xl mx-auto px-6 py-8">
    <DataTable
      data={data.revisions}
      {columns}
      emptyMessage="No published revisions yet"
      onRowClick={(row: RulebookRevisionSummary) => goto(`/rulebook/history/${row.version}`)}
    >
      {#snippet cell(row, col)}
        {#if col.key === 'version'}
          <span class="font-semibold text-white">v{row.version}</span>
        {:else if col.key === 'publishedAt'}
          <span class="text-text-body">{formatDateTime(row.publishedAt)}</span>
        {:else if col.key === 'author'}
          {#if row.publishedBySteamId && row.publishedByName}
            <a
              href="/users/{row.publishedBySteamId}"
              class="text-primary-400 hover:text-primary-300"
              onclick={(event) => event.stopPropagation()}
            >
              {row.publishedByName}
            </a>
          {:else}
            <span class="text-text-muted">Unknown</span>
          {/if}
        {:else if col.key === 'message'}
          <span class="text-text-body">{row.message}</span>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>
