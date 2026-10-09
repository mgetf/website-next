<script lang="ts">
  import type { LayoutData } from './$types';
  import type { Component } from 'svelte';
  import type { SvelteHTMLElements } from 'svelte/elements';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Button from '#lib/components/ui/Button.svelte';
  import ArrowLeft from '~icons/lucide/arrow-left';
  import LayoutDashboard from '~icons/lucide/layout-dashboard';
  import Trophy from '~icons/lucide/trophy';
  import Medal from '~icons/lucide/medal';
  import Users from '~icons/lucide/users';
  import Columns3 from '~icons/lucide/columns-3';
  import Swords from '~icons/lucide/swords';
  import Hourglass from '~icons/lucide/hourglass';
  import Video from '~icons/lucide/video';
  import Map from '~icons/lucide/map';
  import Gavel from '~icons/lucide/gavel';
  import User from '~icons/lucide/user';
  import Search from '~icons/lucide/search';
  import UserCog from '~icons/lucide/user-cog';
  import Globe from '~icons/lucide/globe';
  import Newspaper from '~icons/lucide/newspaper';
  import Package from '~icons/lucide/package';
  import Settings from '~icons/lucide/settings';
  import ClipboardList from '~icons/lucide/clipboard-list';
  import Menu from '~icons/lucide/menu';

  let { data, children }: { data: LayoutData; children: any } = $props();

  type Icon = Component<SvelteHTMLElements['svg']>;

  // Determine active page for sidebar highlighting
  const isActive = (path: string) => {
    if (path === '/admin') {
      return page.url.pathname === '/admin';
    }
    return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
  };

  type NavLink = {
    name: string;
    path:
      | '/admin'
      | '/admin/league'
      | '/admin/maps'
      | '/admin/placement'
      | '/admin/matches'
      | '/admin/disputes'
      | '/admin/demos'
      | '/admin/tournaments'
      | '/admin/teams'
      | '/admin/pending-players'
      | '/admin/users'
      | '/admin/investigate'
      | '/admin/staff'
      | '/admin/global'
      | '/admin/blog'
      | '/admin/item-payments'
      | '/admin/site'
      | '/admin/audit-logs';
    icon: Icon;
    adminOnly: boolean;
  };

  const dashboard = {
    name: 'Dashboard',
    path: '/admin',
    icon: LayoutDashboard,
    adminOnly: false,
  } as const satisfies NavLink;

  // Competition setup, then the match lifecycle, then the side format.
  const groups = [
    {
      name: 'League',
      icon: Trophy,
      items: [
        { name: 'League', path: '/admin/league', icon: Trophy, adminOnly: false },
        { name: 'Maps', path: '/admin/maps', icon: Map, adminOnly: false },
        { name: 'Placement', path: '/admin/placement', icon: Columns3, adminOnly: false },
        { name: 'Matches', path: '/admin/matches', icon: Swords, adminOnly: false },
        { name: 'Disputes', path: '/admin/disputes', icon: Gavel, adminOnly: false },
        { name: 'Demos', path: '/admin/demos', icon: Video, adminOnly: false },
        { name: 'Tournaments', path: '/admin/tournaments', icon: Medal, adminOnly: true },
      ],
    },
    {
      name: 'People',
      icon: Users,
      items: [
        { name: 'Teams', path: '/admin/teams', icon: Users, adminOnly: false },
        {
          name: 'Pending Players',
          path: '/admin/pending-players',
          icon: Hourglass,
          adminOnly: false,
        },
        { name: 'Users', path: '/admin/users', icon: User, adminOnly: false },
        { name: 'Investigate', path: '/admin/investigate', icon: Search, adminOnly: false },
        { name: 'Staff', path: '/admin/staff', icon: UserCog, adminOnly: true },
      ],
    },
    {
      name: 'Website',
      icon: Globe,
      items: [
        { name: 'Global', path: '/admin/global', icon: Globe, adminOnly: false },
        { name: 'Blog', path: '/admin/blog', icon: Newspaper, adminOnly: false },
        { name: 'Item Orders', path: '/admin/item-payments', icon: Package, adminOnly: false },
        { name: 'Site', path: '/admin/site', icon: Settings, adminOnly: false },
        { name: 'Audit Logs', path: '/admin/audit-logs', icon: ClipboardList, adminOnly: true },
      ],
    },
  ] as const satisfies readonly {
    name: string;
    icon: Icon;
    items: readonly NavLink[];
  }[];

  const visibleGroups = $derived(
    groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.adminOnly || data.isStrictAdmin),
      }))
      .filter((group) => group.items.length > 0),
  );

  // Mobile menu state
  let mobileMenuOpen = $state(false);
</script>

<svelte:head>
  <title>Admin Panel - MGE.tf</title>
</svelte:head>

{#snippet navItem(item: NavLink, closeMobile = false, nested = false)}
  <a
    href={resolve(item.path)}
    aria-current={isActive(item.path) ? 'page' : undefined}
    onclick={() => {
      if (closeMobile) mobileMenuOpen = false;
    }}
    class={[
      'relative flex items-center gap-3 rounded-lg transition-all',
      nested ? 'px-3 py-2 text-sm' : 'px-4 py-3',
      isActive(item.path)
        ? 'bg-primary-500/20 text-primary-400 font-medium'
        : 'text-text-label hover:bg-surface-input hover:text-white',
    ]}
  >
    <item.icon class="{nested ? 'size-4' : 'size-5'} shrink-0" />
    <span>{item.name}</span>
  </a>
{/snippet}

{#snippet navGroup(group: (typeof visibleGroups)[number], closeMobile = false)}
  {@const childActive = group.items.some((item) => isActive(item.path))}
  <div>
    <div
      class={['flex items-center gap-3 px-4 py-3', childActive ? 'text-white' : 'text-text-label']}
    >
      <group.icon class="size-5 shrink-0" />
      <span>{group.name}</span>
    </div>
    <div class="mt-1 ml-4 pl-2 border-l border-border-default space-y-0.5">
      {#each group.items as item (item.path)}
        {@render navItem(item, closeMobile, true)}
      {/each}
    </div>
  </div>
{/snippet}

{#snippet navigation(closeMobile = false)}
  {@render backToSite(closeMobile)}
  {@render navItem(dashboard, closeMobile)}
  {#each visibleGroups as group (group.name)}
    {@render navGroup(group, closeMobile)}
  {/each}
{/snippet}

{#snippet backToSite(closeMobile = false)}
  <a
    href={resolve('/')}
    onclick={() => {
      if (closeMobile) mobileMenuOpen = false;
    }}
    class="flex items-center gap-3 px-4 py-3 mb-4 bg-surface-input hover:bg-surface-hover rounded-lg transition-all text-text-label hover:text-white"
  >
    <ArrowLeft class="size-5 shrink-0" />
    <span>Back to Site</span>
  </a>
{/snippet}

<div class="min-h-screen bg-surface-page text-text-label flex">
  <!-- Sidebar -->
  <aside
    class="hidden lg:block w-64 bg-surface-card border-r border-border-default h-screen sticky top-0 overflow-y-auto"
  >
    <nav class="p-4 space-y-1">
      {@render navigation()}
    </nav>
  </aside>

  <!-- Mobile Menu Toggle (Floating Button) -->
  <Button
    variant="primary"
    onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
    aria-label="Toggle menu"
    class="lg:hidden fixed bottom-6 right-6 z-50 p-4! rounded-full! shadow-lg"
  >
    <Menu class="size-6 text-white" />
  </Button>

  <!-- Mobile Sidebar -->
  {#if mobileMenuOpen}
    <div class="lg:hidden fixed inset-0 z-40">
      <button
        type="button"
        class="absolute inset-0 bg-surface-page/80"
        onclick={() => (mobileMenuOpen = false)}
        aria-label="Close menu"
      ></button>
      <div class="relative w-64 bg-surface-card h-full overflow-y-auto" role="dialog">
        <nav class="p-4 space-y-1">
          {@render navigation(true)}
        </nav>
      </div>
    </div>
  {/if}

  <!-- Main Content -->
  <main class="flex-1 p-6 lg:p-8">
    {@render children()}
  </main>
</div>
