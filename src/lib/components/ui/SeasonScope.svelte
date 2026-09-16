<script lang="ts">
  import FlagIcon from './FlagIcon.svelte';
  import { getRegionAbbr } from '$lib/utils/region';
  import { flagForRegion } from '$lib/utils/regions';
  import { sentenceCase } from '$lib/utils/profile';

  let {
    region,
    seasonNum = null,
    division = '',
    class: className = '',
  }: {
    region?: string | null;
    seasonNum?: number | null;
    division?: string | null;
    class?: string;
  } = $props();

  const flagCode = $derived(region ? flagForRegion(getRegionAbbr(region)) : '');
  const hasContent = $derived(!!flagCode || seasonNum != null || !!division);
</script>

{#if hasContent}
  <span class="inline-flex items-center gap-2 font-semibold text-white {className}">
    {#if flagCode}
      <FlagIcon code={flagCode} class="h-4 w-6 rounded" />
    {/if}
    {#if seasonNum != null}
      <span>
        Season {seasonNum}
        {#if division}
          <span class="font-normal text-text-muted"> - {sentenceCase(division)}</span>
        {/if}
      </span>
    {:else if division}
      <span class="font-normal text-text-muted">{sentenceCase(division)}</span>
    {/if}
  </span>
{/if}
