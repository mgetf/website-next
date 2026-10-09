<script lang="ts">
  import FlagIcon from './FlagIcon.svelte';
  import FormatIcon from './FormatIcon.svelte';
  import { getRegionAbbr } from '#lib/utils/region.js';
  import { flagForRegion } from '#lib/utils/regions.js';
  import { sentenceCase } from '#lib/utils/profile.js';

  let {
    region,
    seasonNum = null,
    division = '',
    formatName = '',
    formatIconUrl = null,
    class: className = '',
  }: {
    region?: string | null;
    seasonNum?: number | null;
    division?: string | null;
    formatName?: string | null;
    formatIconUrl?: string | null;
    class?: string;
  } = $props();

  const flagCode = $derived(region ? flagForRegion(getRegionAbbr(region)) : '');
  const hasContent = $derived(!!flagCode || seasonNum != null || !!division || !!formatIconUrl);
</script>

{#if hasContent}
  <span class="inline-flex items-center gap-2 font-semibold text-white {className}">
    {#if flagCode}
      <FlagIcon code={flagCode} class="h-4 w-6 rounded" />
    {/if}
    {#if formatIconUrl}
      <FormatIcon name={formatName || 'Format'} src={formatIconUrl} size="sm" />
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
