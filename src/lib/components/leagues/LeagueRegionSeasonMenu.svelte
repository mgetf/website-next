<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import Check from '~icons/lucide/check';
  import ChevronDown from '~icons/lucide/chevron-down';

  type SeasonOption = {
    id: number;
    name: string;
    seasonNum: number;
  };

  let {
    abbr,
    flagCode,
    selected,
    seasons,
    selectedSeasonId,
    onSelect,
  }: {
    abbr: string;
    flagCode: string;
    selected: boolean;
    seasons: SeasonOption[];
    selectedSeasonId: number;
    onSelect: (seasonId: number) => void;
  } = $props();

  let open = $state(false);

  const currentSeasonNum = $derived(
    seasons.reduce((max, season) => Math.max(max, season.seasonNum), 0),
  );
  const currentSeason = $derived(
    seasons.find((season) => season.seasonNum === currentSeasonNum) ?? null,
  );
  const pastSeasons = $derived(
    seasons
      .filter((season) => season.id !== currentSeason?.id)
      .sort((a, b) => b.seasonNum - a.seasonNum),
  );
  const selectedSeason = $derived(seasons.find((season) => season.id === selectedSeasonId));
  const triggerLabel = $derived(
    selected && selectedSeason ? `${abbr} ${selectedSeason.name}` : abbr,
  );

  const triggerClass = $derived(
    `inline-flex items-center gap-2 px-6 py-2 rounded font-medium transition-all ${
      selected
        ? 'bg-surface-hover text-white border border-border-input'
        : 'bg-surface-card text-text-label hover:bg-surface-input border border-border-default'
    }`,
  );
  const contentClass =
    'z-50 min-w-52 max-h-72 overflow-y-auto rounded-lg border border-border-default bg-surface-card p-1 shadow-xl outline-none';
  const itemClass =
    'flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-label outline-none data-highlighted:bg-surface-input data-highlighted:text-white';
  const headingClass =
    'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted';

  function handleValueChange(value: string) {
    const seasonId = Number(value);
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;
    onSelect(seasonId);
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger type="button" class={triggerClass} aria-label={triggerLabel}>
    {#if flagCode}
      <FlagIcon code={flagCode} class="h-3.5 w-5 overflow-hidden rounded-sm" />
    {/if}
    <span>{triggerLabel}</span>
    <ChevronDown
      class="size-4 shrink-0 text-text-muted transition-transform {open ? 'rotate-180' : ''}"
    />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class={contentClass} sideOffset={6} align="center">
      <DropdownMenu.RadioGroup
        value={selected ? String(selectedSeasonId) : ''}
        onValueChange={handleValueChange}
      >
        {#if currentSeason && pastSeasons.length > 0}
          {@const current = currentSeason}
          <DropdownMenu.Group>
            <DropdownMenu.GroupHeading class={headingClass}>Current</DropdownMenu.GroupHeading>
            <DropdownMenu.RadioItem class={itemClass} value={String(current.id)}>
              {#snippet children({ checked })}
                <span>{current.name}</span>
                {#if checked}
                  <Check class="size-4 shrink-0 text-primary-400" />
                {/if}
              {/snippet}
            </DropdownMenu.RadioItem>
          </DropdownMenu.Group>
          <DropdownMenu.Separator class="my-1 h-px bg-border-default" />
          <DropdownMenu.Group>
            <DropdownMenu.GroupHeading class={headingClass}>Past seasons</DropdownMenu.GroupHeading>
            {#each pastSeasons as season (season.id)}
              <DropdownMenu.RadioItem class={itemClass} value={String(season.id)}>
                {#snippet children({ checked })}
                  <span>{season.name}</span>
                  {#if checked}
                    <Check class="size-4 shrink-0 text-primary-400" />
                  {/if}
                {/snippet}
              </DropdownMenu.RadioItem>
            {/each}
          </DropdownMenu.Group>
        {:else}
          {#each seasons as season (season.id)}
            <DropdownMenu.RadioItem class={itemClass} value={String(season.id)}>
              {#snippet children({ checked })}
                <span>{season.name}</span>
                {#if checked}
                  <Check class="size-4 shrink-0 text-primary-400" />
                {/if}
              {/snippet}
            </DropdownMenu.RadioItem>
          {/each}
        {/if}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
