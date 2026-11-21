<script lang="ts">
  import type { EliminationBracketData } from '#lib/types/bracket.js';
  import BracketCanvas from './BracketCanvas.svelte';

  interface Props {
    data: EliminationBracketData;
  }

  let { data }: Props = $props();
</script>

<BracketCanvas {data} />
