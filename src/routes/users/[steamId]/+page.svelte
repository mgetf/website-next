<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import InsightsPanel from '$lib/components/profile/InsightsPanel.svelte';
  import LeaguePanel from '$lib/components/profile/LeaguePanel.svelte';
  import OverviewPanel from '$lib/components/profile/OverviewPanel.svelte';
  import StaffToolsPanel from '$lib/components/profile/StaffToolsPanel.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import StaffRoleBadge from '$lib/components/ui/StaffRoleBadge.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import type { MgeRating, PlatformRegion } from '$lib/types/mge';
  import type {
    Profile1v1Entry,
    ProfileTab,
    ProfileTeam,
    ProfileTeamSeasonMatches,
  } from '$lib/types/profile';
  import { parseProfileTab, profileExternalLinks } from '$lib/utils/profile';
  import { steamId32FromSteamId64 } from '$lib/utils/steamid';
  import Settings from '~icons/lucide/settings';

  interface TeamWithMatches {
    teamId: number;
    teamName: string;
    avatar: string | null;
    formatCode: string;
    formatName: string;
    formatThemeKey: string;
    formatIconUrl: string | null;
    division: string;
    regionName: string;
    seasonNum: number;
    status: string;
    wins: number;
    losses: number;
    totalRecord: string;
    joined: Date;
    permissionLevel?: string;
    left?: Date | null;
    matchesBySeason: ProfileTeamSeasonMatches[];
  }

  interface PlayerData {
    player: {
      steamId: string;
      name: string;
      avatar: string | null;
      discordLinked: boolean;
      discordUsername: string | null;
      permissionLevel: string;
      banStatus: string;
      punishmentCount: number;
      nameOverride: number;
      avatarOverride: number;
      staffAssignments: { formatName: string; divisionName: string; regionName: string }[];
    };
    isOwnProfile: boolean;
    isAdmin: boolean;
    currentTeams: TeamWithMatches[];
    teamHistory: TeamWithMatches[];
    tournaments: Array<{
      id: number;
      name: string;
      date: string | null;
      placement: string;
    }>;
    fightNights: Array<{
      id: number;
      fightNightName: string;
      opponent: string;
      result: string;
      score: string;
      date: string | null;
    }>;
    achievements: Array<{
      placement: string;
      event: string;
      date: string | null;
    }>;
    current1v1Entry: {
      id: number;
      division: string;
      divisionId: number | null;
      region: string;
      regionId: number | null;
      seasonNum: number;
      wins: number;
      losses: number;
    } | null;
    entries1v1: Profile1v1Entry[];
    divisions1v1: Array<{ id: number; name: string; signupCost: number; regionId: number }>;
    ratings: MgeRating[];
    platformRegions: PlatformRegion[];
    formats: Array<{ code: string; name: string; iconUrl: string | null }>;
  }

  let { data }: { data: PlayerData } = $props();

  const player = $derived(data.player);
  const staffMedalRole = $derived.by(() => {
    if (player.permissionLevel === 'ADMIN') return 'ADMIN' as const;
    if (player.permissionLevel === 'MODERATOR') return 'MODERATOR' as const;
    return null;
  });
  const mgeRatings = $derived(data.ratings);
  const isOwnProfile = $derived(data.isOwnProfile);
  const isAdmin = $derived(data.isAdmin);
  const entries1v1 = $derived(data.entries1v1);
  const activeEntry = $derived(entries1v1.find((e) => e.active) ?? null);
  const profileTeams = $derived<ProfileTeam[]>([
    ...data.currentTeams.map((team) => ({ ...team, active: true })),
    ...data.teamHistory.map((team) => ({ ...team, active: false })),
  ]);

  const tab = $derived(parseProfileTab(page.url.searchParams.get('tab')));
  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: '1v1', label: '1v1' },
    { id: 'stats', label: 'Stats' },
  ];

  let withdrawingEntry: Profile1v1Entry | null = $state(null);
  let isWithdrawing = $state(false);
  let staffOpen = $state(false);
  let admin1v1Status = $state('');
  let admin1v1DivisionId = $state('');
  let showReadyConfirm = $state(false);
  let isReadying = $state(false);
  let showMarkPaidConfirm = $state(false);
  let isMarkingPaid = $state(false);
  let readyFormEl: HTMLFormElement | undefined = $state();
  let markPaidFormEl: HTMLFormElement | undefined = $state();
  let statusFormEl: HTMLFormElement | undefined = $state();
  let divisionFormEl: HTMLFormElement | undefined = $state();

  const profilePath = $derived(resolve('/users/[steamId]', { steamId: player.steamId }));

  $effect(() => {
    if (!activeEntry) return;
    admin1v1Status = activeEntry.status;
    admin1v1DivisionId = activeEntry.divisionId != null ? String(activeEntry.divisionId) : '';
  });

  $effect(() => {
    const discord = page.url.searchParams.get('discord');
    const error = page.url.searchParams.get('error');
    const signup = page.url.searchParams.get('signup');
    if (discord === 'linked') {
      toast.success('Discord account linked successfully!');
      goto(profilePath, { replaceState: true });
    } else if (error === 'discord_auth_failed') {
      toast.error('Failed to link Discord account');
      goto(profilePath, { replaceState: true });
    } else if (signup === '1v1') {
      toast.success('Successfully signed up for the 1v1 league!');
      goto(profilePath, { replaceState: true });
    }
  });

  const externalLinks = $derived(
    profileExternalLinks(player.steamId, steamId32FromSteamId64(player.steamId)),
  );

  function getBanBadge(status: string): { label: string; classes: string } | null {
    if (status === 'WARNING')
      return {
        label: 'Warning',
        classes: 'bg-warning-500/20 text-warning-400 border-warning-500/30',
      };
    if (status === 'SUSPENDED')
      return {
        label: 'Suspended',
        classes: 'bg-primary-500/20 text-primary-400 border-primary-500/30',
      };
    if (status === 'BANNED')
      return { label: 'Banned', classes: 'bg-danger-500/20 text-danger-400 border-danger-500/30' };
    return null;
  }

  function tabHref(next: ProfileTab): string {
    const params = new URLSearchParams(page.url.searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    const search = params.toString();
    return search ? `${profilePath}?${search}` : profilePath;
  }

  function setTab(next: ProfileTab) {
    void goto(tabHref(next), { keepFocus: true, noScroll: true });
  }
</script>

<svelte:head>
  <title>{player.name} | MGE.tf</title>
</svelte:head>

<header class="border-b border-border-default bg-surface-page/80">
  <div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center">
    <img
      src={player.avatar || '/default-avatar.png'}
      alt=""
      class="size-24 shrink-0 rounded-xl border-2 border-border-input object-cover shadow-lg"
    />

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-3xl font-black tracking-tight text-white sm:text-4xl">{player.name}</h1>
        {#if staffMedalRole}
          <StaffRoleBadge role={staffMedalRole} assignments={player.staffAssignments} />
        {/if}
      </div>
      {#if isAdmin}
        <p class="mt-1.5 font-mono text-xs text-text-muted">{player.steamId}</p>
      {/if}

      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        {#each externalLinks as link (link.name)}
          <Tooltip text={link.name}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              class="flex size-8 items-center justify-center rounded-lg bg-surface-input transition-colors hover:bg-surface-hover"
            >
              <img src={link.logo} alt="" class="size-4 {link.rounded ? 'rounded' : ''}" />
              <span class="sr-only">{link.name}</span>
            </a>
          </Tooltip>
        {/each}

        {#if player.discordLinked}
          <span
            class="inline-flex items-center gap-1.5 rounded-lg bg-info-500/20 px-2.5 py-1.5 text-xs text-info-400"
          >
            <DiscordIcon size={14} />
            {player.discordUsername}
          </span>
        {:else if isOwnProfile}
          <Button
            href={resolve('/auth/discord/login')}
            size="sm"
            class="inline-flex items-center gap-1.5"
          >
            <DiscordIcon size={14} />
            Link Discord
          </Button>
        {:else}
          <span
            class="inline-flex items-center gap-1.5 rounded-lg bg-surface-input px-2.5 py-1.5 text-xs text-text-body"
          >
            <DiscordIcon size={14} />
            Discord not linked
          </span>
        {/if}
      </div>
    </div>

    {#if isAdmin}
      <div class="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <div class="flex flex-wrap gap-1.5 lg:justify-end">
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Name:</span>
            <span class={player.nameOverride === 1 ? 'text-primary-400' : 'text-text-body'}>
              {player.nameOverride === 1 ? 'Locked' : 'Auto'}</span
            >
          </button>
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Avatar:</span>
            <span class={player.avatarOverride === 1 ? 'text-primary-400' : 'text-text-body'}>
              {player.avatarOverride === 1 ? 'Locked' : 'Auto'}</span
            >
          </button>
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Status:</span>
            {#if getBanBadge(player.banStatus)}
              {@const badge = getBanBadge(player.banStatus)!}
              <span class="text-warning-400"
                >{badge.label}{player.punishmentCount > 1
                  ? ` (${player.punishmentCount})`
                  : ''}</span
              >
            {:else}
              <span class="text-success-400"
                >Clean{player.punishmentCount > 0 ? ` (${player.punishmentCount})` : ''}</span
              >
            {/if}
          </button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          class="inline-flex items-center gap-1.5"
          aria-expanded={staffOpen}
          aria-controls="staff-tools-panel"
          onclick={() => (staffOpen = true)}
        >
          <Settings class="size-3.5" />
          Staff tools
        </Button>
      </div>
    {/if}
  </div>
</header>

<div class="border-b border-border-default bg-surface-page">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="flex gap-1" role="tablist" aria-label="Profile sections">
      {#each tabs as item (item.id)}
        <a
          href={tabHref(item.id)}
          role="tab"
          id="tab-{item.id}"
          aria-selected={tab === item.id}
          aria-controls="panel-{item.id}"
          data-sveltekit-noscroll
          class="inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors {tab ===
          item.id
            ? 'border-primary-500 text-white'
            : 'border-transparent text-text-muted hover:text-text-label'}"
        >
          {item.label}
        </a>
      {/each}
    </div>
  </div>
</div>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
  {#if tab === 'overview'}
    <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
      <OverviewPanel
        ratings={mgeRatings}
        regions={data.platformRegions}
        steamId={player.steamId}
        playerName={player.name}
        playerAvatar={player.avatar}
        isOwn={isOwnProfile}
        {entries1v1}
        teams={profileTeams}
        achievements={data.achievements}
        tournaments={data.tournaments}
        fightNights={data.fightNights}
        formats={data.formats}
        onOpen1v1={() => setTab('1v1')}
      />
    </div>
  {:else if tab === '1v1'}
    <div id="panel-1v1" role="tabpanel" aria-labelledby="tab-1v1">
      <LeaguePanel
        steamId={player.steamId}
        isOwn={isOwnProfile}
        isStaff={isAdmin}
        entry={activeEntry}
        divisions={data.divisions1v1}
        onReady={() => (showReadyConfirm = true)}
        onWithdraw={() => (withdrawingEntry = activeEntry)}
        onUpdateStatus={(status) => {
          admin1v1Status = status;
          queueMicrotask(() => statusFormEl?.requestSubmit());
        }}
        onUpdateDivision={(divisionId) => {
          admin1v1DivisionId = divisionId;
          queueMicrotask(() => divisionFormEl?.requestSubmit());
        }}
        onMarkPaid={() => (showMarkPaidConfirm = true)}
      />
    </div>
  {:else}
    <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
      <InsightsPanel steamId={player.steamId} ratings={mgeRatings} regions={data.platformRegions} />
    </div>
  {/if}
</div>

{#if activeEntry}
  <form
    bind:this={statusFormEl}
    method="POST"
    action="?/change1v1Status"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') {
          toast.success((result.data as any)?.message || 'Status updated');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to change status');
        }
      };
    }}
    class="hidden"
  >
    <input type="hidden" name="teamId" value={activeEntry.id} />
    <input type="hidden" name="status" value={admin1v1Status} />
  </form>

  <form
    bind:this={divisionFormEl}
    method="POST"
    action="?/change1v1Division"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') {
          toast.success((result.data as any)?.message || 'Division updated');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to change division');
        }
      };
    }}
    class="hidden"
  >
    <input type="hidden" name="teamId" value={activeEntry.id} />
    <input type="hidden" name="divisionId" value={admin1v1DivisionId} />
  </form>
{/if}

<!-- Hidden forms for 1v1 management actions -->
{#if activeEntry}
  <form
    bind:this={readyFormEl}
    method="POST"
    action="?/ready1v1"
    use:enhance={() => {
      isReadying = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        isReadying = false;
        showReadyConfirm = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.message || 'Ready up submitted');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to ready up');
        }
      };
    }}
    class="hidden"
  >
    <input type="hidden" name="teamId" value={activeEntry.id} />
  </form>

  <form
    bind:this={markPaidFormEl}
    method="POST"
    action="?/mark1v1Paid"
    use:enhance={() => {
      isMarkingPaid = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        isMarkingPaid = false;
        showMarkPaidConfirm = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.message || 'Player marked as paid');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to mark player as paid');
        }
      };
    }}
    class="hidden"
  >
    <input type="hidden" name="teamId" value={activeEntry.id} />
  </form>
{/if}

<ConfirmDialog
  open={showReadyConfirm}
  title="Ready Up"
  description="Mark your 1v1 entry as ready? An admin will review and approve your entry for the season."
  confirmLabel="Ready Up"
  loadingLabel="Submitting..."
  variant="success"
  isLoading={isReadying}
  onConfirm={() => readyFormEl?.requestSubmit()}
  onCancel={() => (showReadyConfirm = false)}
/>

<ConfirmDialog
  open={showMarkPaidConfirm}
  title="Mark as Paid"
  description="Mark {player.name} as paid? This records a manual payment outside of the automatic payment options."
  confirmLabel="Mark as Paid"
  loadingLabel="Saving..."
  variant="success"
  isLoading={isMarkingPaid}
  onConfirm={() => markPaidFormEl?.requestSubmit()}
  onCancel={() => (showMarkPaidConfirm = false)}
/>

{#if isAdmin}
  <StaffToolsPanel bind:open={staffOpen} {player} />
{/if}

<!-- 1v1 Withdrawal Confirmation Modal -->
<Dialog
  open={!!withdrawingEntry}
  title="Withdraw from 1v1 League"
  onClose={() => (withdrawingEntry = null)}
>
  <p class="text-text-body mb-4">
    Are you sure you want to withdraw from the 1v1 league? This action cannot be undone.
  </p>

  {#if withdrawingEntry}
    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <div class="flex justify-between text-sm">
        <span class="text-text-body">Division:</span>
        <span class="text-white">{withdrawingEntry.division}</span>
      </div>
      <div class="flex justify-between text-sm mt-1">
        <span class="text-text-body">Region:</span>
        <span class="text-white">{withdrawingEntry.region}</span>
      </div>
      <div class="flex justify-between text-sm mt-1">
        <span class="text-text-body">Season:</span>
        <span class="text-white">S{withdrawingEntry.seasonNum}</span>
      </div>
      <div class="flex justify-between text-sm mt-1">
        <span class="text-text-body">Record:</span>
        <span class="text-white">{withdrawingEntry.wins}-{withdrawingEntry.losses}</span>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <Button
      type="button"
      variant="secondary"
      class="flex-1"
      onclick={() => (withdrawingEntry = null)}
    >
      Cancel
    </Button>
    {#if withdrawingEntry}
      <form
        method="POST"
        action="?/withdraw1v1"
        use:enhance={() => {
          isWithdrawing = true;
          return async ({ update }) => {
            await update();
            isWithdrawing = false;
            withdrawingEntry = null;
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="teamId" value={withdrawingEntry.id} />
        <Button type="submit" variant="danger" disabled={isWithdrawing} class="w-full">
          {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
        </Button>
      </form>
    {/if}
  {/snippet}
</Dialog>
