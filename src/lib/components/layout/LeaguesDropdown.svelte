<script lang="ts">
  import type { LeagueNav } from '$lib/types/league';
  import Card from '$lib/components/ui/Card.svelte';
  import LeaguesNavGrid from './LeaguesNavGrid.svelte';
  import { page } from '$app/state';

  type Props = {
    leagueNav: LeagueNav;
  };

  let { leagueNav }: Props = $props();

  let open = $state(false);
  let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

  const leaguesActive = $derived(page.url.pathname.startsWith('/leagues'));

  function clearHoverClose() {
    if (hoverCloseTimer) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
  }

  function toggle() {
    clearHoverClose();
    open = !open;
  }

  function close() {
    clearHoverClose();
    open = false;
  }

  function canHover() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function openOnHover() {
    if (!canHover()) return;
    clearHoverClose();
    open = true;
  }

  function closeOnHover() {
    if (!canHover()) return;
    clearHoverClose();
    hoverCloseTimer = setTimeout(() => {
      open = false;
      hoverCloseTimer = null;
    }, 150);
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.leagues-dropdown-container')) {
      close();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      close();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div
  class="leagues-dropdown-container relative"
  role="navigation"
  aria-label="Leagues"
  onmouseenter={openOnHover}
  onmouseleave={closeOnHover}
>
  <button
    type="button"
    onclick={toggle}
    aria-expanded={open}
    aria-haspopup="true"
    aria-controls="leagues-nav-menu"
    class={[
      'px-3 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1 whitespace-nowrap',
      leaguesActive || open
        ? 'text-white bg-surface-input/50'
        : 'text-text-label hover:text-white hover:bg-surface-input/50',
    ]}
  >
    Leagues
    <svg
      class="w-4 h-4 transition-transform {open ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div id="leagues-nav-menu" class="absolute left-0 top-full z-50 pt-1">
      <Card padding="sm" class="w-[min(28rem,calc(100vw-2rem))] shadow-lg">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
          Format / region
        </p>
        <LeaguesNavGrid {leagueNav} onNavigate={close} />
      </Card>
    </div>
  {/if}
</div>
