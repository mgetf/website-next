<script lang="ts">
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import DiffView from '$lib/components/markdown/DiffView.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { formatDateTime } from '$lib/utils/datetime';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let view = $state<'diff' | 'full'>('diff');

  const revision = $derived(data.revision);
</script>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-5xl font-black text-white mb-2">Revision {revision.version}</h1>
        <p class="text-xl text-text-body">{revision.message}</p>
        <p class="mt-2 text-sm text-text-muted">
          {formatDateTime(revision.publishedAt)}
          {#if revision.publishedBySteamId && revision.publishedByName}
            by
            <a
              href="/users/{revision.publishedBySteamId}"
              class="text-primary-400 hover:text-primary-300"
            >
              {revision.publishedByName}
            </a>
          {/if}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#if revision.previousVersion}
          <Button variant="secondary" size="sm" href="/rulebook/history/{revision.previousVersion}">
            Previous
          </Button>
        {/if}
        {#if revision.nextVersion}
          <Button variant="secondary" size="sm" href="/rulebook/history/{revision.nextVersion}">
            Next
          </Button>
        {/if}
        <Button variant="secondary" size="sm" href="/rulebook/history">All revisions</Button>
      </div>
    </div>
  </PageHero>

  <div class="max-w-7xl mx-auto px-6 py-8 space-y-4">
    <div class="flex gap-2">
      <Button
        type="button"
        variant={view === 'diff' ? 'primary' : 'secondary'}
        size="sm"
        onclick={() => (view = 'diff')}
      >
        Changes
      </Button>
      <Button
        type="button"
        variant={view === 'full' ? 'primary' : 'secondary'}
        size="sm"
        onclick={() => (view = 'full')}
      >
        Full text
      </Button>
    </div>

    {#if view === 'diff'}
      <Card>
        {#if revision.previousVersion}
          <p class="mb-4 text-sm text-text-muted">
            Compared to revision {revision.previousVersion}
          </p>
        {:else}
          <p class="mb-4 text-sm text-text-muted">First published revision</p>
        {/if}
        <DiffView hunks={revision.hunks} />
      </Card>
    {:else}
      <Card>
        <MarkdownRenderer content={revision.content} />
      </Card>
    {/if}
  </div>
</div>
