<script lang="ts">
  import type { RoundRobinBracketData } from '$lib/types/bracket';
  import RoundRobinMatchList from './RoundRobinMatchList.svelte';
  import RoundRobinStandings from './RoundRobinStandings.svelte';

  interface Props {
    data: RoundRobinBracketData;
  }

  let { data }: Props = $props();
</script>

<div class="space-y-8">
  {#if data.title}
    <h3 class="text-lg font-bold text-text-heading">{data.title}</h3>
  {/if}

  <section>
    <h3 class="mb-4 text-lg font-bold text-text-heading">Standings</h3>
    <RoundRobinStandings standings={data.standings} />
  </section>

  <section>
    <h3 class="mb-4 text-lg font-bold text-text-heading">Matches</h3>
    <RoundRobinMatchList rounds={data.rounds} />
  </section>
</div>
