<script lang="ts">
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import type { SignupFeeSummary } from '$lib/types/signupFee';

  let {
    fee,
    selectedRegionId = null,
    align = 'center',
    class: extraClass = '',
  }: {
    fee: SignupFeeSummary;
    selectedRegionId?: number | null;
    align?: 'center' | 'start';
    class?: string;
  } = $props();
</script>

{#if fee.regions.length > 0}
  <div
    class={[
      'flex flex-wrap gap-2',
      align === 'start' ? 'justify-start' : 'justify-center',
      extraClass,
    ]}
    data-testid="signup-fee"
  >
    {#each fee.regions as region (region.regionId)}
      <div
        class={[
          'flex max-w-[8.5rem] flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 transition-opacity',
          selectedRegionId === region.regionId
            ? 'border-primary-500/50 bg-primary-500/10'
            : 'border-border-default',
          selectedRegionId != null && selectedRegionId !== region.regionId && 'opacity-40',
        ]}
        data-testid="signup-fee-region"
        title={region.name}
        aria-label={region.name}
      >
        <span class="flex items-center gap-1.5">
          {#if region.flagCode}
            <FlagIcon code={region.flagCode} class="h-3.5 w-[1.15rem] rounded-sm" />
          {:else}
            <span class="text-xs font-semibold tracking-wide text-white">{region.abbr}</span>
          {/if}
          {#if region.kind === 'free'}
            <span class="text-xs font-semibold text-success-400">Free</span>
          {:else if region.moneyLabel}
            <span class="text-xs font-semibold text-white">{region.moneyLabel}</span>
          {:else if region.itemLabel}
            <span
              class="max-w-[5.5rem] truncate text-xs font-semibold text-white"
              title={region.itemLabel}>{region.itemLabel}</span
            >
          {/if}
        </span>
        {#if region.kind === 'paid' && region.moneyLabel && region.itemLabel}
          <span class="max-w-full truncate text-[10px] text-text-muted" title={region.itemLabel}
            >{region.itemLabel}</span
          >
        {/if}
      </div>
    {/each}
  </div>
{/if}
