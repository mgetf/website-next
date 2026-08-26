<script lang="ts">
  import type { LeagueNav, LeagueNavFormat } from '$lib/types/league';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';
  import { page } from '$app/state';

  type Props = {
    leagueNav: LeagueNav;
    onNavigate?: () => void;
  };

  let { leagueNav, onNavigate }: Props = $props();

  const currentFormat = $derived(page.url.pathname.match(/^\/leagues\/([^/]+)/)?.[1] ?? '');
  const currentRegionId = $derived(Number.parseInt(page.url.searchParams.get('region') ?? '', 10));

  function isCellActive(formatCode: string, regionId: number) {
    return currentFormat === formatCode && currentRegionId === regionId;
  }

  function cellClass(format: LeagueNavFormat, regionId: number) {
    const theme = getFormatThemeClasses(format.themeKey);
    const active = isCellActive(format.code, regionId);
    const base =
      'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-center transition-colors min-w-[4.25rem]';
    return active
      ? `${base} ${theme.bg500_20} ${theme.border500_30} text-white`
      : `${base} border-border-default text-text-label hover:bg-surface-hover hover:text-white`;
  }
</script>

<div class="space-y-4">
  {#each leagueNav.formats as format (format.code)}
    {@const theme = getFormatThemeClasses(format.themeKey)}
    <div>
      <div class="flex items-center justify-between gap-3 mb-2">
        <p class="text-xs font-semibold uppercase tracking-wider {theme.text400}">
          {format.name}
        </p>
        <a
          href={format.href}
          class="text-[11px] font-medium text-text-muted hover:text-white transition-colors"
          onclick={onNavigate}
        >
          All seasons
        </a>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each format.cells as cell (cell.regionId)}
          {@const region = leagueNav.regions.find((r) => r.id === cell.regionId)}
          {#if region}
            <a
              href={cell.href}
              class={cellClass(format, cell.regionId)}
              onclick={onNavigate}
              aria-current={isCellActive(format.code, cell.regionId) ? 'page' : undefined}
            >
              <span class="flex items-center gap-1.5">
                {#if region.flagCode}
                  <FlagIcon code={region.flagCode} class="w-4 h-3 rounded-sm" />
                {/if}
                <span class="text-xs font-semibold tracking-wide">{region.abbr}</span>
              </span>
              <span class="text-[10px] text-text-muted">Season {cell.seasonNum}</span>
            </a>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>
