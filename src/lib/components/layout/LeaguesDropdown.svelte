<script lang="ts">
  import { Popover } from 'bits-ui';
  import type { LeagueNav } from '$lib/types/league';
  import Card from '$lib/components/ui/Card.svelte';
  import LeaguesNavGrid from './LeaguesNavGrid.svelte';
  import { page } from '$app/state';
  import ChevronDown from '~icons/lucide/chevron-down';

  type Props = {
    leagueNav: LeagueNav;
  };

  let { leagueNav }: Props = $props();

  let open = $state(false);

  const leaguesActive = $derived(page.url.pathname.startsWith('/leagues'));

  function close() {
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    type="button"
    openOnHover
    openDelay={0}
    closeDelay={150}
    aria-label="Leagues"
    aria-controls="leagues-nav-menu"
    class={[
      'px-3 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1 whitespace-nowrap',
      leaguesActive || open
        ? 'text-white bg-surface-input/50'
        : 'text-text-label hover:text-white hover:bg-surface-input/50',
    ].join(' ')}
  >
    Leagues
    <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      id="leagues-nav-menu"
      class="z-50 p-0 bg-transparent border-0 shadow-none outline-none"
      align="start"
      sideOffset={4}
    >
      <Card padding="sm" class="w-[min(28rem,calc(100vw-2rem))] shadow-lg">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
          Format / region
        </p>
        <LeaguesNavGrid {leagueNav} onNavigate={close} />
      </Card>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
