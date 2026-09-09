<script lang="ts">
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import type { SignupFeeItem, SignupFeeRegion, SignupFeeSummary } from '$lib/types/signupFee';

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

  function regionFeeText(region: SignupFeeRegion): string {
    if (region.kind === 'free') return `${region.name}: Free`;
    const parts = [region.moneyLabel, region.itemLabel].filter(
      (part): part is string => part != null,
    );
    return `${region.name}: ${parts.join(' / ')}`;
  }
</script>

{#snippet itemDisplay(item: SignupFeeItem)}
  {#if item.iconUrl}
    <img src={item.iconUrl} alt="" class="h-4 w-4 shrink-0 object-contain" />
    <span class="text-xs font-semibold text-white">{item.quantityLabel}</span>
  {:else}
    <span class="text-xs font-semibold text-white">{item.quantityLabel}× {item.name}</span>
  {/if}
{/snippet}

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
      {@const label = regionFeeText(region)}
      <div
        class={[
          'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 whitespace-nowrap transition-opacity',
          selectedRegionId === region.regionId
            ? 'border-primary-500/50 bg-primary-500/10'
            : 'border-border-default',
          selectedRegionId != null && selectedRegionId !== region.regionId && 'opacity-40',
        ]}
        data-testid="signup-fee-region"
        title={label}
        aria-label={label}
      >
        {#if region.flagCode}
          <FlagIcon code={region.flagCode} class="h-3.5 w-[1.15rem] rounded-sm" />
        {:else}
          <span class="text-xs font-semibold tracking-wide text-white">{region.abbr}</span>
        {/if}
        {#if region.kind === 'free'}
          <span class="text-xs font-semibold text-success-400">Free</span>
        {:else}
          {#if region.moneyLabel}
            <span class="text-xs font-semibold text-white">{region.moneyLabel}</span>
          {/if}
          {#each region.items as item, index (item.name)}
            {#if region.moneyLabel || index > 0}
              <span class="text-text-muted" aria-hidden="true">/</span>
            {/if}
            {@render itemDisplay(item)}
          {/each}
        {/if}
      </div>
    {/each}
  </div>
{/if}
