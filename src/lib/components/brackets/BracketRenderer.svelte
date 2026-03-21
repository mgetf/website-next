<script lang="ts">
  import type { BracketData } from '$lib/types/bracket';
  import EliminationBracket from './EliminationBracket.svelte';
  import FightCard from './FightCard.svelte';
  import { initBracketHover } from './bracket-hover.svelte';

  interface Props {
    data: BracketData;
  }

  let { data }: Props = $props();

  initBracketHover();
</script>

{#if data.format === 'single_elim' || data.format === 'double_elim'}
  <EliminationBracket {data} />
{:else if data.format === 'card'}
  <FightCard {data} />
{:else}
  <p class="text-text-muted text-sm italic">Format not yet supported: {data.format}</p>
{/if}
