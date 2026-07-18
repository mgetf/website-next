<script lang="ts">
  import type { CardBracketData } from '$lib/types/bracket';
  import MatchCard from './MatchCard.svelte';

  interface Props {
    data: CardBracketData;
  }

  let { data }: Props = $props();

  const matches = $derived(data.rounds[0]?.matches ?? []);
  const lastIndex = $derived(matches.length - 1);
</script>

<div>
  {#if data.title}
    <h3 class="text-lg font-bold text-text-heading mb-6">{data.title}</h3>
  {/if}

  <div class="flex flex-col gap-3">
    {#each matches as match, i (match.id)}
      {#if i === lastIndex}
        <div class="ring-1 ring-primary-600/60 rounded-lg">
          <MatchCard {match} />
        </div>
      {:else}
        <div style:width="var(--bracket-match-width, 12rem)">
          <MatchCard {match} />
        </div>
      {/if}
    {/each}
  </div>
</div>
