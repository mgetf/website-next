<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import type { ProfileMatch } from '$lib/types/match';
  import type { MgeRating } from '$lib/types/mge';
  import { steamId32FromSteamId64 } from '$lib/utils/steamid';

  const REGION_FLAGS: Record<string, string> = {
    na: 'us',
    eu: 'eu',
    as: 'sg',
  };

  interface TeamWithMatches {
    teamId: number;
    teamName: string;
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
    matches: ProfileMatch[];
  }

  interface Entry1v1WithMatches {
    id: number;
    active: boolean;
    status: string;
    division: string;
    divisionId: number | null;
    regionId: number | null;
    region: string;
    seasonNum: number;
    wins: number;
    losses: number;
    startedAt: Date | null;
    leftAt: Date | null;
    matches: ProfileMatch[];
    isPaid: boolean;
    signupCost: number;
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
      staffDivisions: { name: string; region: string }[];
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
    entries1v1: Entry1v1WithMatches[];
    divisions1v1: Array<{ id: number; name: string; signupCost: number; regionId: number }>;
    ratings: MgeRating[];
  }

  let { data }: { data: PlayerData } = $props();

  const player = $derived(data.player);
  const mgeRatings = $derived(data.ratings);
  const currentTeams = $derived(data.currentTeams);
  const teamHistory = $derived(data.teamHistory);
  const tournaments = $derived(data.tournaments);
  const fightNights = $derived(data.fightNights);
  const achievements = $derived(data.achievements);
  const isOwnProfile = $derived(data.isOwnProfile);
  const isAdmin = $derived(data.isAdmin);
  const current1v1Entry = $derived(data.current1v1Entry);
  const entries1v1 = $derived(data.entries1v1);

  const activeEntry = $derived(entries1v1.find((e) => e.active) ?? null);
  const active1v1IsPaidDiv = $derived(activeEntry ? activeEntry.signupCost > 0 : false);
  const active1v1CanReady = $derived(
    activeEntry !== null &&
      activeEntry.status === 'UNREADY' &&
      (activeEntry.isPaid || !active1v1IsPaidDiv),
  );

  // Merged 2v2 list: active teams first (current), then history, each sorted by seasonNum desc
  const teams2v2 = $derived([
    ...currentTeams.map((t) => ({ ...t, active: true })),
    ...teamHistory.map((t) => ({ ...t, active: false })),
  ]);

  // Accordion expanded state — active entries/teams start expanded
  let expanded1v1 = $state<Record<number, boolean>>({});
  let expanded2v2 = $state<Record<number, boolean>>({});

  $effect(() => {
    const next1v1: Record<number, boolean> = {};
    for (const e of entries1v1) {
      if (!(e.id in expanded1v1)) next1v1[e.id] = e.active;
    }
    Object.assign(expanded1v1, next1v1);
  });

  $effect(() => {
    const next2v2: Record<number, boolean> = {};
    for (const t of teams2v2) {
      if (!(t.teamId in expanded2v2)) next2v2[t.teamId] = t.active;
    }
    Object.assign(expanded2v2, next2v2);
  });

  // State for 1v1 withdrawal confirmation modal
  let withdrawingEntry: (typeof data.entries1v1)[0] | null = $state(null);
  let isWithdrawing = $state(false);

  // State for Discord unlink (admin only)
  let isUnlinkingDiscord = $state(false);
  let showUnlinkDiscordConfirm = $state(false);

  // State for admin actions
  let showEditName = $state(false);
  let showEditAvatar = $state(false);
  let showPunish = $state(false);
  let editNameValue = $state('');
  let editAvatarValue = $state('');
  let punishSeverity = $state('');
  let isAdminSubmitting = $state(false);

  let showReadyConfirm = $state(false);
  let isReadying = $state(false);
  let showMarkPaidConfirm = $state(false);
  let isMarkingPaid = $state(false);
  let readyFormEl: HTMLFormElement | undefined = $state();
  let markPaidFormEl: HTMLFormElement | undefined = $state();

  $effect(() => {
    const discord = page.url.searchParams.get('discord');
    const error = page.url.searchParams.get('error');
    const signup = page.url.searchParams.get('signup');
    if (discord === 'linked') {
      toast.success('Discord account linked successfully!');
      goto(page.url.pathname, { replaceState: true });
    } else if (error === 'discord_auth_failed') {
      toast.error('Failed to link Discord account');
      goto(page.url.pathname, { replaceState: true });
    } else if (signup === '1v1') {
      toast.success('Successfully signed up for the 1v1 league!');
      goto(page.url.pathname, { replaceState: true });
    }
  });

  // External profile links - also reactive to player changes
  const externalLinks = $derived([
    {
      name: 'Steam',
      url: `https://steamcommunity.com/profiles/${player.steamId}`,
      logo: '/steam_logo.png',
    },
    {
      name: 'logs.tf',
      url: `https://logs.tf/profile/${player.steamId}`,
      logo: '/logstf_logo.png',
    },
    {
      name: 'RGL',
      url: `https://rgl.gg/Public/PlayerProfile.aspx?p=${player.steamId}`,
      logo: '/rgl_logo.png',
    },
    {
      name: 'ETF2L',
      url: `https://etf2l.org/search/${player.steamId}/`,
      logo: '/etf2l_logo.png',
    },
    {
      name: 'UGC-Gaming',
      url: `https://stats.ugc-gaming.net/mge-stats/?search=${encodeURIComponent(steamId32FromSteamId64(player.steamId))}`,
      logo: '/ugcgaming_logo.png',
    },
    {
      name: 'SteamHistory',
      url: `https://steamhistory.net/id/${player.steamId}`,
      logo: '/steamhistory_logo.jpg',
      rounded: true,
    },
    {
      name: 'SteamLadder',
      url: `https://steamladder.com/profile/${player.steamId}/`,
      logo: '/steamladder_logo.png',
    },
  ]);

  // Format date helper
  function formatDate(date: Date | string | null): string {
    if (!date) return 'N/A';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }

  // Get placement color
  function getPlacementColor(placement: string): string {
    if (placement.includes('1st')) return 'text-warning-400';
    if (placement.includes('2nd')) return 'text-text-label';
    if (placement.includes('3rd')) return 'text-primary-400';
    return 'text-text-body';
  }

  // Get result color
  function getResultColor(result: string): string {
    if (result === 'W') return 'text-success-400';
    if (result === 'L') return 'text-danger-400';
    return 'text-text-body';
  }

  function getResultBg(result: string): string {
    if (result === 'W') return 'bg-success-500/20 text-success-400 border-success-500/30';
    if (result === 'L') return 'bg-danger-500/20 text-danger-400 border-danger-500/30';
    return 'bg-surface-input text-text-muted border-border-input';
  }

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

  function openEditName() {
    editNameValue = player.nameOverride === 1 ? player.name : '';
    showEditName = true;
  }

  function openEditAvatar() {
    editAvatarValue = player.avatarOverride === 1 ? player.avatar || '' : '';
    showEditAvatar = true;
  }

  function winPct(wins: number, losses: number): string {
    const total = wins + losses;
    if (total === 0) return '0';
    return ((wins / total) * 100).toFixed(0);
  }
</script>

<div class="min-h-screen pb-16">
  <!-- Player Hero Section -->
  <PageHero maxWidth="max-w-6xl">
    <div class="flex flex-col items-center gap-4">
      <!-- Player Avatar -->
      <div class="relative flex-shrink-0 group/avatar">
        <img
          src={player.avatar}
          alt={player.name}
          class="w-32 h-32 rounded-lg border-4 border-border-input shadow-2xl"
        />
        {#if isAdmin}
          <button
            type="button"
            onclick={openEditAvatar}
            class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-surface-input border border-border-input text-text-body hover:bg-blue-500/50 hover:border-info-500/50 hover:text-white opacity-0 group-hover/avatar:opacity-100 transition-all"
            title="Edit Avatar (Admin)"
          >
            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Player Name -->
      <div class="relative group/name">
        <h1 class="text-5xl font-black text-white">
          {player.name}
        </h1>
        {#if isAdmin}
          <button
            type="button"
            onclick={openEditName}
            class="absolute -top-1 -right-4 w-4 h-4 flex items-center justify-center rounded-full bg-surface-input border border-border-input text-text-body hover:bg-blue-500/50 hover:border-info-500/50 hover:text-white opacity-0 group-hover/name:opacity-100 transition-all"
            title="Edit Name (Admin)"
          >
            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Role & Staff Division Badges -->
      {#if player.permissionLevel !== 'GUEST'}
        <div class="flex flex-wrap gap-2 justify-center">
          {#if player.permissionLevel === 'ADMIN'}
            {#if player.staffDivisions.length > 0}
              {#each player.staffDivisions as div}
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                >
                  <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fill-rule="evenodd"
                      d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Admin<span class="text-purple-500/70 font-normal mx-0.5">·</span>{div.name} · {div.region}
                </span>
              {/each}
            {:else}
              <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
              >
                <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fill-rule="evenodd"
                    d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
                    clip-rule="evenodd"
                  />
                </svg>
                Admin
              </span>
            {/if}
          {:else if player.permissionLevel === 'MODERATOR'}
            {#if player.staffDivisions.length > 0}
              {#each player.staffDivisions as div}
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-info-500/20 text-blue-300 border border-info-500/40 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
                >
                  <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fill-rule="evenodd"
                      d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Moderator<span class="text-blue-500/70 font-normal mx-0.5">·</span>{div.name} · {div.region}
                </span>
              {/each}
            {:else}
              <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-info-500/20 text-blue-300 border border-info-500/40 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
              >
                <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fill-rule="evenodd"
                    d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
                    clip-rule="evenodd"
                  />
                </svg>
                Moderator
              </span>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- External Links -->
      <div class="flex flex-wrap gap-2 justify-center">
        {#each externalLinks as link (link.name)}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="px-3 py-2 bg-surface-input hover:bg-surface-hover rounded-lg transition-colors flex items-center gap-2 group"
            title={link.name}
          >
            <img src={link.logo} alt={link.name} class="w-5 h-5 {link.rounded ? 'rounded' : ''}" />
            <span class="text-xs text-text-body group-hover:text-white hidden sm:inline">
              {link.name}
            </span>
          </a>
        {/each}
      </div>

      <!-- Discord Status -->
      {#if player.discordLinked}
        <div
          class="relative inline-flex items-center gap-2 px-4 py-2 bg-info-500/20 rounded-lg text-info-400 text-sm group/discord"
        >
          <DiscordIcon size={16} />
          <span>{player.discordUsername || 'Discord linked'}</span>
          {#if isAdmin}
            <button
              type="button"
              onclick={() => (showUnlinkDiscordConfirm = true)}
              disabled={isUnlinkingDiscord}
              class="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-surface-input border border-border-input text-text-body hover:bg-danger-500/50 hover:border-danger-500/50 hover:text-white opacity-0 group-hover/discord:opacity-100 transition-all disabled:opacity-50"
              title="Unlink Discord (Admin)"
            >
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/if}
        </div>
      {:else if isOwnProfile}
        <Button href="/auth/discord/login" class="inline-flex items-center gap-2">
          <DiscordIcon size={16} />
          <span>Link Discord Account</span>
        </Button>
      {:else}
        <div
          class="inline-flex items-center gap-2 px-4 py-2 bg-surface-input/50 rounded-lg text-text-body text-sm"
        >
          <DiscordIcon size={16} />
          <span>Discord not linked</span>
        </div>
      {/if}
    </div>

    <!-- Admin Zone -->
    {#if isAdmin}
      <div class="max-w-xs mx-auto mt-4 pt-3 border-t border-border-default">
        <div class="flex items-center justify-center gap-2">
          <button
            type="button"
            onclick={openEditName}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-input/60 hover:bg-surface-hover/60 border border-border-input/40 text-[11px] transition-colors cursor-pointer group/namebtn"
          >
            <span class="text-text-muted">Name:</span>
            <span class={player.nameOverride === 1 ? 'text-primary-400' : 'text-text-body'}
              >{player.nameOverride === 1 ? 'Locked' : 'Auto'}</span
            >
            <svg
              class="w-2.5 h-2.5 text-text-muted group-hover/namebtn:text-text-body transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          <button
            type="button"
            onclick={openEditAvatar}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-input/60 hover:bg-surface-hover/60 border border-border-input/40 text-[11px] transition-colors cursor-pointer group/avatarbtn"
          >
            <span class="text-text-muted">Avatar:</span>
            <span class={player.avatarOverride === 1 ? 'text-primary-400' : 'text-text-body'}
              >{player.avatarOverride === 1 ? 'Locked' : 'Auto'}</span
            >
            <svg
              class="w-2.5 h-2.5 text-text-muted group-hover/avatarbtn:text-text-body transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          <button
            type="button"
            onclick={() => (showPunish = true)}
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-input/60 hover:bg-surface-hover/60 border border-border-input/40 text-[11px] transition-colors cursor-pointer group/statusbtn"
          >
            <span class="text-text-muted">Status:</span>
            {#if getBanBadge(player.banStatus)}
              {@const badge = getBanBadge(player.banStatus)!}
              <span
                class="whitespace-nowrap {badge.classes
                  .split(' ')
                  .filter((c) => c.startsWith('text-'))
                  .join(' ')}"
                >{badge.label}{player.punishmentCount > 1
                  ? ` (${player.punishmentCount})`
                  : ''}</span
              >
            {:else}
              <span class="whitespace-nowrap text-success-400"
                >Clean{player.punishmentCount > 0 ? ` (${player.punishmentCount})` : ''}</span
              >
            {/if}
            <svg
              class="w-2.5 h-2.5 text-text-muted group-hover/statusbtn:text-text-body transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </button>
        </div>
      </div>
    {/if}
  </PageHero>

  <!-- Main Content -->
  <div class="max-w-[1600px] mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Sidebar -->
      <aside class="lg:col-span-3 space-y-6">
        <!-- MGE ELO -->
        {#if mgeRatings.length > 0}
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
          >
            <div
              class="bg-surface-page/80 px-4 py-3 border-b border-border-default flex items-center justify-between"
            >
              <h3 class="text-lg font-bold text-white">MGE ELO</h3>
              <Button variant="primary" size="sm" href="/logs?player={player.steamId}">Logs</Button>
            </div>
            <div class="divide-y divide-border-default/50">
              {#each mgeRatings as rating}
                {@const flagCode = REGION_FLAGS[rating.region] ?? rating.region}
                <div class="flex items-center justify-between px-4 py-3">
                  <div class="flex items-center gap-2">
                    <FlagIcon code={flagCode} class="w-6 h-4 rounded" />
                    <span class="text-sm font-medium text-text-label"
                      >{rating.region.toUpperCase()}</span
                    >
                  </div>
                  <div class="text-right">
                    <span class="text-lg font-black text-white">{rating.elo}</span>
                    {#if rating.wins !== null || rating.losses !== null}
                      <div class="text-xs text-text-muted">
                        <span class="text-success-400">{rating.wins ?? 0}W</span>
                        <span class="mx-0.5">/</span>
                        <span class="text-danger-400">{rating.losses ?? 0}L</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Achievements -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-4 py-3 border-b border-border-default">
            <h3 class="text-lg font-bold text-white">Achievements</h3>
          </div>
          {#if achievements.length > 0}
            <div class="divide-y divide-border-default/50">
              {#each achievements as achievement (achievement.event)}
                <div
                  class="flex items-center gap-3 px-4 py-3 hover:bg-surface-input/30 transition-colors"
                >
                  <div class="flex-shrink-0">
                    <svg
                      class="w-5 h-5 {achievement.placement === '1st Place'
                        ? 'text-warning-400'
                        : achievement.placement === '2nd Place'
                          ? 'text-text-label'
                          : achievement.placement === '3rd Place'
                            ? 'text-primary-400'
                            : 'text-text-muted'}"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z"
                      />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold {getPlacementColor(achievement.placement)}">
                        {achievement.placement}
                      </span>
                      <span class="text-sm font-medium text-white truncate">
                        {achievement.event}
                      </span>
                    </div>
                    <p class="text-xs text-text-muted mt-0.5">
                      {formatDate(achievement.date)}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-4 py-6 text-center">
              <p class="text-text-muted text-sm">No achievements yet</p>
            </div>
          {/if}
        </div>

        <!-- Tournaments -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-4 py-3 border-b border-border-default">
            <h3 class="text-lg font-bold text-white">Tournaments</h3>
          </div>
          {#if tournaments.length > 0}
            <div class="divide-y divide-border-default/50">
              {#each tournaments as t (t.id)}
                <div
                  class="flex items-center justify-between px-4 py-3 hover:bg-surface-input/30 transition-colors"
                >
                  <div class="min-w-0">
                    <div class="text-sm text-white truncate">{t.name}</div>
                    <div class="text-xs text-text-muted">{formatDate(t.date)}</div>
                  </div>
                  <span
                    class="text-xs font-bold ml-3 whitespace-nowrap {getPlacementColor(
                      t.placement,
                    )}">{t.placement}</span
                  >
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-4 py-6 text-center text-text-muted text-sm">No tournament history</div>
          {/if}
        </div>

        <!-- Fight Nights -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-4 py-3 border-b border-border-default">
            <h3 class="text-lg font-bold text-white">Fight Nights</h3>
          </div>
          {#if fightNights.length > 0}
            <div class="divide-y divide-border-default/50">
              {#each fightNights as fn (fn.id)}
                <div
                  class="flex items-center justify-between px-4 py-3 hover:bg-surface-input/30 transition-colors"
                >
                  <div class="min-w-0">
                    <div class="text-sm text-white">{fn.fightNightName}</div>
                    <div class="text-xs text-text-muted">vs {fn.opponent}</div>
                  </div>
                  <span
                    class="text-xs font-bold font-mono ml-3 whitespace-nowrap {getResultColor(
                      fn.result,
                    )}"
                  >
                    {fn.result}
                    {fn.score}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-4 py-6 text-center text-text-muted text-sm">No Fight Night history</div>
          {/if}
        </div>
      </aside>

      <!-- Main Content -->
      <main class="lg:col-span-9 space-y-6">
        <!-- Payment CTA Banner -->
        {#if isOwnProfile && activeEntry && !activeEntry.isPaid && active1v1IsPaidDiv}
          <div
            class="rounded-lg border border-warning-500/30 bg-warning-500/5 p-4 flex items-center justify-between gap-4"
          >
            <div class="flex items-start gap-3">
              <svg
                class="w-5 h-5 text-warning-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h3 class="text-sm font-bold text-white">Payment Required</h3>
                <p class="text-sm text-text-body mt-0.5">
                  You need to pay your signup fee before you can ready up for the season.
                </p>
              </div>
            </div>
            <Button variant="warning" href="/checkout/{player.steamId}" class="flex-shrink-0">
              Go to Checkout
            </Button>
          </div>
        {/if}

        <!-- 1v1 League -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-purple-800/50 overflow-hidden"
        >
          <div class="bg-surface-page/80 px-6 py-4 border-b border-purple-800/50">
            <h2 class="text-2xl font-bold text-white">1v1 League</h2>
            <p class="text-sm text-text-body mt-1">Individual Competition</p>
          </div>

          {#if entries1v1.length > 0}
            <div class="divide-y divide-border-default/50">
              {#each entries1v1 as entry (entry.id)}
                {@const isOpen = expanded1v1[entry.id] ?? entry.active}
                {@const pct = winPct(entry.wins, entry.losses)}

                <div>
                  <button
                    type="button"
                    onclick={() => (expanded1v1[entry.id] = !isOpen)}
                    class="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-input/30 transition-colors text-left {entry.active
                      ? 'bg-purple-500/5'
                      : 'opacity-70'}"
                  >
                    <div class="flex items-center gap-4">
                      <span
                        class="text-xs font-bold px-2 py-1 rounded border whitespace-nowrap {entry.active
                          ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                          : 'bg-surface-input text-text-muted border-border-input'}"
                      >
                        S{entry.seasonNum}
                      </span>
                      <div>
                        <span class="font-semibold text-white text-sm">
                          {entry.division}
                          <span class="text-text-muted font-normal ml-1">· {entry.region}</span>
                        </span>
                        <div class="flex items-center gap-3 mt-0.5">
                          <span
                            class="text-sm font-mono {entry.active
                              ? 'text-purple-400'
                              : 'text-text-body'}"
                          >
                            {entry.wins}–{entry.losses}
                          </span>
                          <span class="text-xs text-text-muted">{pct}% WR</span>
                          {#if entry.status === 'READY' || entry.status === 'PLACEMENT'}
                            <Badge color="green">Active</Badge>
                          {:else if entry.status === 'PENDING'}
                            <Badge color="yellow">Pending</Badge>
                          {:else if entry.status === 'UNREADY'}
                            <Badge color="zinc">Unready</Badge>
                          {/if}
                        </div>
                      </div>
                    </div>
                    <svg
                      class="w-4 h-4 text-text-muted transition-transform duration-200 flex-shrink-0 {isOpen
                        ? 'rotate-180'
                        : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {#if isOpen}
                    <div class="border-t border-border-default/50">
                      {#if entry.matches.length > 0}
                        <table class="w-full text-sm">
                          <thead>
                            <tr
                              class="bg-surface-page/60 text-xs text-text-muted uppercase tracking-wide"
                            >
                              <th class="text-left px-6 py-2 font-medium">Week</th>
                              <th class="text-left px-6 py-2 font-medium">Opponent</th>
                              <th class="text-center px-6 py-2 font-medium">Result</th>
                              <th class="text-center px-6 py-2 font-medium">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each entry.matches as match (match.matchId)}
                              <tr
                                class="border-t border-border-default/30 hover:bg-surface-input/20 transition-colors {match.result ===
                                'TBD'
                                  ? 'opacity-50'
                                  : ''}"
                              >
                                <td class="px-6 py-2.5 text-text-muted text-xs whitespace-nowrap"
                                  >{match.week}</td
                                >
                                <td class="px-6 py-2.5">
                                  <a
                                    href="/matches/{match.matchId}"
                                    class="text-white hover:text-primary-400 transition-colors font-medium text-sm"
                                  >
                                    {match.opponentName || 'TBD'}
                                  </a>
                                </td>
                                <td class="px-6 py-2.5 text-center">
                                  <span
                                    class="inline-block px-2 py-0.5 rounded text-xs font-bold border {getResultBg(
                                      match.result,
                                    )}"
                                  >
                                    {match.result}
                                  </span>
                                </td>
                                <td
                                  class="px-6 py-2.5 text-center font-mono text-xs {getResultColor(
                                    match.result,
                                  )}"
                                >
                                  {match.score}
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      {:else}
                        <div class="px-6 py-4 text-sm text-text-muted">
                          No matches scheduled yet.
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-6 py-8 text-center space-y-4">
              <p class="text-text-muted text-sm">No 1v1 season history</p>
              {#if isOwnProfile}
                <div>
                  <Button href="/leagues/1v1" variant="format-1v1" size="sm">
                    Browse 1v1 League
                  </Button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 2v2 League -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
            <h2 class="text-2xl font-bold text-white">2v2 League</h2>
            <p class="text-sm text-text-body mt-1">Team Competition</p>
          </div>

          {#if teams2v2.length > 0}
            <div class="divide-y divide-border-default/50">
              {#each teams2v2 as team (team.teamId)}
                {@const isOpen = expanded2v2[team.teamId] ?? team.active}
                {@const pct = winPct(team.wins, team.losses)}

                <div>
                  <button
                    type="button"
                    onclick={() => (expanded2v2[team.teamId] = !isOpen)}
                    class="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-input/30 transition-colors text-left {team.active
                      ? 'bg-success-500/5'
                      : 'opacity-70'}"
                  >
                    <div class="flex items-center gap-4">
                      <span
                        class="text-xs font-bold px-2 py-1 rounded border whitespace-nowrap {team.active
                          ? 'bg-success-500/20 text-success-400 border-success-500/30'
                          : 'bg-surface-input text-text-muted border-border-input'}"
                      >
                        S{team.seasonNum}
                      </span>
                      <div>
                        <span class="font-semibold text-white text-sm">
                          <a
                            href="/teams/{team.teamId}"
                            class="hover:text-primary-400 transition-colors"
                            onclick={(e) => e.stopPropagation()}
                          >
                            {team.teamName}
                          </a>
                          <span class="text-text-muted font-normal ml-1"
                            >· {team.division} · {team.regionName}</span
                          >
                        </span>
                        <div class="flex items-center gap-3 mt-0.5">
                          <span
                            class="text-sm font-mono {team.active
                              ? 'text-success-400'
                              : 'text-text-body'}"
                          >
                            {team.wins}–{team.losses}
                          </span>
                          <span class="text-xs text-text-muted">{pct}% WR</span>
                          {#if team.status === 'READY' || team.status === 'PLACEMENT'}
                            <Badge color="green">Active</Badge>
                          {:else if team.status === 'PENDING'}
                            <Badge color="yellow">Pending</Badge>
                          {:else if team.status === 'UNREADY'}
                            <Badge color="zinc">Unready</Badge>
                          {/if}
                        </div>
                      </div>
                    </div>
                    <svg
                      class="w-4 h-4 text-text-muted transition-transform duration-200 flex-shrink-0 {isOpen
                        ? 'rotate-180'
                        : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {#if isOpen}
                    <div class="border-t border-border-default/50">
                      {#if team.matches.length > 0}
                        <table class="w-full text-sm">
                          <thead>
                            <tr
                              class="bg-surface-page/60 text-xs text-text-muted uppercase tracking-wide"
                            >
                              <th class="text-left px-6 py-2 font-medium">Week</th>
                              <th class="text-left px-6 py-2 font-medium">Opponent</th>
                              <th class="text-center px-6 py-2 font-medium">Result</th>
                              <th class="text-center px-6 py-2 font-medium">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each team.matches as match (match.matchId)}
                              <tr
                                class="border-t border-border-default/30 hover:bg-surface-input/20 transition-colors {match.result ===
                                'TBD'
                                  ? 'opacity-50'
                                  : ''}"
                              >
                                <td class="px-6 py-2.5 text-text-muted text-xs whitespace-nowrap"
                                  >{match.week}</td
                                >
                                <td class="px-6 py-2.5">
                                  {#if match.opponentId}
                                    <a
                                      href="/teams/{match.opponentId}"
                                      class="text-white hover:text-primary-400 transition-colors font-medium text-sm"
                                    >
                                      {match.opponentName}
                                    </a>
                                  {:else}
                                    <span class="text-text-muted italic text-sm">TBD</span>
                                  {/if}
                                </td>
                                <td class="px-6 py-2.5 text-center">
                                  <span
                                    class="inline-block px-2 py-0.5 rounded text-xs font-bold border {getResultBg(
                                      match.result,
                                    )}"
                                  >
                                    {match.result}
                                  </span>
                                </td>
                                <td
                                  class="px-6 py-2.5 text-center font-mono text-xs {getResultColor(
                                    match.result,
                                  )}"
                                >
                                  {match.score}
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      {:else}
                        <div class="px-6 py-4 text-sm text-text-muted">
                          No matches scheduled yet.
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-6 py-8 text-center space-y-4">
              <p class="text-text-muted text-sm">No 2v2 season history</p>
              {#if isOwnProfile}
                <div>
                  <Button href="/leagues/2v2" variant="format-2v2" size="sm">
                    Browse 2v2 League
                  </Button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Section 2: 1v1 Management -->
        {#if isOwnProfile && activeEntry}
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
          >
            <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
              <h2 class="text-xl font-bold text-white">1v1 Management</h2>
            </div>

            <div class="p-6 space-y-6">
              {#if activeEntry.status === 'UNREADY'}
                {#if active1v1IsPaidDiv}
                  <div
                    class="p-4 rounded-lg border {activeEntry.isPaid
                      ? 'border-success-500/30 bg-success-500/5'
                      : 'border-warning-500/30 bg-warning-500/5'}"
                  >
                    <div class="flex items-center gap-3 mb-2">
                      <span
                        class="flex items-center justify-center w-7 h-7 rounded-full {activeEntry.isPaid
                          ? 'bg-success-600'
                          : 'bg-warning-600'} text-white text-sm font-bold flex-shrink-0"
                      >
                        {#if activeEntry.isPaid}
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        {:else}
                          1
                        {/if}
                      </span>
                      <h3 class="text-lg font-bold text-white">Pay Signup Fee</h3>
                      <span
                        class="text-sm {activeEntry.isPaid
                          ? 'text-success-400'
                          : 'text-warning-400'} font-medium ml-auto"
                      >
                        {activeEntry.isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    {#if !activeEntry.isPaid}
                      <div class="ml-10 space-y-3">
                        <p class="text-sm text-text-body">
                          Pay your signup fee to unlock the ready-up step.
                        </p>
                        <Button variant="warning" href="/checkout/{player.steamId}">
                          Go to Checkout
                        </Button>
                      </div>
                    {/if}
                  </div>
                {/if}

                <div
                  class="p-4 rounded-lg border {active1v1CanReady
                    ? 'border-primary-500/30 bg-primary-500/5'
                    : 'border-border-default bg-surface-page/30'}"
                >
                  <div class="flex items-center gap-3 mb-2">
                    <span
                      class="flex items-center justify-center w-7 h-7 rounded-full {active1v1CanReady
                        ? 'bg-primary-600'
                        : 'bg-surface-input'} text-white text-sm font-bold flex-shrink-0"
                    >
                      {active1v1IsPaidDiv ? '2' : '1'}
                    </span>
                    <h3
                      class="text-lg font-bold {active1v1CanReady
                        ? 'text-white'
                        : 'text-text-muted'}"
                    >
                      Ready Up
                    </h3>
                    {#if !active1v1CanReady && active1v1IsPaidDiv}
                      <svg class="w-4 h-4 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fill-rule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {/if}
                  </div>
                  <div class="ml-10">
                    {#if active1v1CanReady}
                      <p class="text-sm text-text-body mb-3">
                        Once ready, an admin will review and approve your entry for the season.
                      </p>
                      <Button variant="primary" onclick={() => (showReadyConfirm = true)}>
                        Ready Up
                      </Button>
                    {:else if active1v1IsPaidDiv && !activeEntry.isPaid}
                      <p class="text-sm text-text-muted">
                        Available after you've paid your signup fee.
                      </p>
                    {/if}
                  </div>
                </div>
              {:else if activeEntry.status === 'PENDING'}
                <div class="p-4 rounded-lg border border-warning-500/30 bg-warning-500/5">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-warning-400 animate-pulse"></span>
                    <span class="text-warning-400 font-semibold">Pending Admin Approval</span>
                  </div>
                  <p class="text-sm text-text-body mt-2">
                    Your entry has been marked as ready and is awaiting admin review.
                  </p>
                </div>
              {/if}
              <Button variant="danger" onclick={() => (withdrawingEntry = activeEntry)}>
                Withdraw from League
              </Button>
            </div>
          </div>
        {/if}

        <!-- Section 3: 1v1 Admin Controls -->
        {#if isAdmin && activeEntry}
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
          >
            <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
              <h2 class="text-xl font-bold text-white">Admin Controls</h2>
            </div>

            <div class="p-6 space-y-6">
              <div>
                <h3 class="text-lg font-bold text-white mb-4">Change Status</h3>
                <form
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
                  class="flex gap-3 items-end"
                >
                  <input type="hidden" name="teamId" value={activeEntry.id} />
                  <div class="flex-1">
                    <label
                      for="admin-1v1-status"
                      class="block text-sm font-medium text-text-label mb-2"
                    >
                      Status
                    </label>
                    <select
                      id="admin-1v1-status"
                      name="status"
                      class="w-full px-4 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:border-primary-500"
                    >
                      {#each [{ value: 'UNREADY', label: 'Unready' }, { value: 'PENDING', label: 'Pending' }, { value: 'READY', label: 'Ready' }, { value: 'DEAD', label: 'Withdrawn' }] as opt}
                        <option value={opt.value} selected={opt.value === activeEntry.status}>
                          {opt.label}
                        </option>
                      {/each}
                    </select>
                  </div>
                  <Button type="submit">Update Status</Button>
                </form>
              </div>

              {#if data.divisions1v1.length > 0}
                <div class="pt-4 border-t border-border-default">
                  <h3 class="text-lg font-bold text-white mb-4">Change Division</h3>
                  <form
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
                    class="flex gap-3 items-end"
                  >
                    <input type="hidden" name="teamId" value={activeEntry.id} />
                    <div class="flex-1">
                      <label
                        for="admin-1v1-divisionId"
                        class="block text-sm font-medium text-text-label mb-2"
                      >
                        Division
                      </label>
                      <select
                        id="admin-1v1-divisionId"
                        name="divisionId"
                        class="w-full px-4 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:border-primary-500"
                      >
                        {#each data.divisions1v1 as division}
                          <option
                            value={division.id}
                            selected={division.id === activeEntry.divisionId}
                          >
                            {division.name}{division.signupCost > 0
                              ? ` ($${division.signupCost})`
                              : ' (free)'}
                          </option>
                        {/each}
                      </select>
                    </div>
                    <Button type="submit">Update Division</Button>
                  </form>
                </div>
              {/if}

              {#if !activeEntry.isPaid && activeEntry.signupCost > 0}
                <div class="pt-4 border-t border-border-default">
                  <h3 class="text-lg font-bold text-white mb-4">Mark as Paid</h3>
                  <div class="flex items-center justify-between p-3 bg-surface-page/50 rounded-lg">
                    <div class="flex items-center gap-3">
                      {#if player.avatar}
                        <img src={player.avatar} alt={player.name} class="w-8 h-8 rounded" />
                      {/if}
                      <span class="text-white font-medium">{player.name}</span>
                      <Badge color="red">Unpaid</Badge>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      onclick={() => (showMarkPaidConfirm = true)}
                    >
                      Mark as Paid
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </main>
    </div>
  </div>
</div>

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

<!-- Discord Unlink Confirmation Modal -->
<Dialog
  open={showUnlinkDiscordConfirm}
  title="Unlink Discord Account"
  onClose={() => (showUnlinkDiscordConfirm = false)}
>
  <p class="text-text-body mb-4">
    Are you sure you want to unlink <span class="text-white font-medium">{player.name}</span>'s
    Discord account?
  </p>

  {#if player.discordUsername}
    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <div class="flex items-center gap-2">
        <DiscordIcon size={16} />
        <span class="text-success-400 text-sm">{player.discordUsername}</span>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <Button
      type="button"
      variant="secondary"
      class="flex-1"
      onclick={() => (showUnlinkDiscordConfirm = false)}
    >
      Cancel
    </Button>
    <form
      method="POST"
      action="?/unlinkDiscord"
      use:enhance={() => {
        isUnlinkingDiscord = true;
        return async ({ update, result }) => {
          await update();
          isUnlinkingDiscord = false;
          showUnlinkDiscordConfirm = false;
          if (result.type === 'success') {
            toast.success('Discord account unlinked');
          } else if (result.type === 'failure') {
            toast.error((result.data?.error as string) || 'Failed to unlink Discord');
          }
        };
      }}
      class="flex-1"
    >
      <Button type="submit" variant="danger" disabled={isUnlinkingDiscord} class="w-full">
        {isUnlinkingDiscord ? 'Unlinking...' : 'Unlink Discord'}
      </Button>
    </form>
  {/snippet}
</Dialog>

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

<!-- Admin: Edit Name Modal -->
<Dialog
  open={showEditName}
  title={player.nameOverride === 1 ? 'Manage Locked Name' : 'Set Custom Name'}
  onClose={() => (showEditName = false)}
>
  <div class="flex items-center gap-3 p-3 bg-surface-input rounded-lg mb-4">
    {#if player.avatar}
      <img src={player.avatar} alt={player.name} class="w-10 h-10 rounded" />
    {/if}
    <div>
      <p class="text-white font-medium">{player.name}</p>
      <p class="text-xs text-text-muted font-mono">{player.steamId}</p>
    </div>
    {#if player.nameOverride === 1}
      <span
        class="ml-auto px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500/20 text-primary-400 border border-orange-500/30"
      >
        LOCKED
      </span>
    {/if}
  </div>

  {#if player.nameOverride === 1}
    <form
      id="form-lock-name"
      method="POST"
      action="?/lockName"
      use:enhance={() => {
        isAdminSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isAdminSubmitting = false;
          if (result.type === 'success') {
            showEditName = false;
            toast.success('Name updated');
          } else if (result.type === 'failure') {
            toast.error((result.data as any)?.error || 'Failed to update name');
          }
        };
      }}
    >
      <div class="mb-4">
        <label for="edit-name" class="block text-sm font-medium text-text-label mb-2">
          Change locked name
        </label>
        <input
          id="edit-name"
          name="name"
          type="text"
          bind:value={editNameValue}
          maxlength="64"
          required
          placeholder="New display name..."
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
        />
      </div>
    </form>

    <div class="border-t border-border-default pt-4 mt-4">
      <p class="text-xs text-text-muted">
        Or unlock the name to let it sync from Steam on next login.
      </p>
      <form
        id="form-unlock-name"
        method="POST"
        action="?/unlockName"
        use:enhance={() => {
          isAdminSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isAdminSubmitting = false;
            if (result.type === 'success') {
              showEditName = false;
              toast.success((result.data as any)?.message || 'Name unlocked');
            } else if (result.type === 'failure') {
              toast.error((result.data as any)?.error || 'Failed to unlock name');
            }
          };
        }}
      ></form>
    </div>
  {:else}
    <p class="text-sm text-text-body mb-4">
      This will set a custom name and lock it. The name will no longer auto-update from Steam.
    </p>

    <form
      id="form-lock-name"
      method="POST"
      action="?/lockName"
      use:enhance={() => {
        isAdminSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isAdminSubmitting = false;
          if (result.type === 'success') {
            showEditName = false;
            toast.success('Name set and locked');
          } else if (result.type === 'failure') {
            toast.error((result.data as any)?.error || 'Failed to update name');
          }
        };
      }}
    >
      <div>
        <label for="edit-name-new" class="block text-sm font-medium text-text-label mb-2">
          Display Name
        </label>
        <input
          id="edit-name-new"
          name="name"
          type="text"
          bind:value={editNameValue}
          maxlength="64"
          required
          placeholder={player.name}
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
        />
      </div>
    </form>
  {/if}

  {#snippet footer()}
    {#if player.nameOverride === 1}
      <Button
        type="submit"
        form="form-unlock-name"
        variant="secondary"
        disabled={isAdminSubmitting}
      >
        {isAdminSubmitting ? 'Unlocking...' : 'Unlock Name'}
      </Button>
      <div class="flex-1"></div>
      <Button type="button" variant="secondary" onclick={() => (showEditName = false)}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="form-lock-name"
        variant="primary"
        disabled={isAdminSubmitting ||
          !editNameValue.trim() ||
          editNameValue.trim() === player.name}
      >
        {isAdminSubmitting ? 'Saving...' : 'Save'}
      </Button>
    {:else}
      <Button
        type="button"
        variant="secondary"
        class="flex-1"
        onclick={() => (showEditName = false)}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form="form-lock-name"
        variant="primary"
        class="flex-1"
        disabled={isAdminSubmitting || !editNameValue.trim()}
      >
        {isAdminSubmitting ? 'Saving...' : 'Set & Lock Name'}
      </Button>
    {/if}
  {/snippet}
</Dialog>

<!-- Admin: Edit Avatar Modal -->
<Dialog
  open={showEditAvatar}
  title={player.avatarOverride === 1 ? 'Avatar (Locked)' : 'Set Avatar'}
  onClose={() => (showEditAvatar = false)}
>
  <div class="flex items-center gap-4 mb-4">
    <div class="flex-shrink-0">
      <p class="text-xs text-text-muted mb-1">Current</p>
      {#if player.avatar}
        <img
          src={player.avatar}
          alt={player.name}
          class="w-16 h-16 rounded-lg border border-border-input"
        />
      {:else}
        <div
          class="w-16 h-16 rounded-lg border border-border-input bg-surface-input flex items-center justify-center text-text-muted text-xs"
        >
          None
        </div>
      {/if}
    </div>
    {#if editAvatarValue.trim()}
      <div class="flex-shrink-0">
        <p class="text-xs text-text-muted mb-1">Preview</p>
        <img
          src={editAvatarValue}
          alt="Preview"
          class="w-16 h-16 rounded-lg border border-border-input object-cover"
          onerror={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    {/if}
  </div>

  <form
    id="form-edit-avatar"
    method="POST"
    action="?/lockAvatar"
    use:enhance={() => {
      isAdminSubmitting = true;
      return async ({ update, result }) => {
        await update();
        isAdminSubmitting = false;
        if (result.type === 'success') {
          showEditAvatar = false;
          toast.success('Avatar set and locked');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to update avatar');
        }
      };
    }}
  >
    <div>
      <label for="edit-avatar" class="block text-sm font-medium text-text-label mb-2">
        Avatar URL
      </label>
      <input
        id="edit-avatar"
        name="avatarUrl"
        type="url"
        bind:value={editAvatarValue}
        placeholder="https://example.com/avatar.png"
        class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
      />
      {#if player.avatarOverride === 0}
        <p class="mt-1.5 text-xs text-text-muted">
          Setting an avatar URL will lock it, preventing Steam from overwriting it on login.
        </p>
      {/if}
    </div>
  </form>

  {#if player.avatarOverride === 1}
    <div class="border-t border-border-default pt-4 mt-4">
      <p class="text-xs text-text-muted">
        Or unlock the avatar to let it sync from Steam on next login.
      </p>
      <form
        id="form-unlock-avatar"
        method="POST"
        action="?/unlockAvatar"
        use:enhance={() => {
          isAdminSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isAdminSubmitting = false;
            if (result.type === 'success') {
              showEditAvatar = false;
              toast.success((result.data as any)?.message || 'Avatar unlocked');
            } else if (result.type === 'failure') {
              toast.error((result.data as any)?.error || 'Failed to unlock avatar');
            }
          };
        }}
      ></form>
    </div>
  {/if}

  {#snippet footer()}
    {#if player.avatarOverride === 1}
      <Button
        type="submit"
        form="form-unlock-avatar"
        variant="secondary"
        disabled={isAdminSubmitting}
      >
        {isAdminSubmitting ? 'Unlocking...' : 'Unlock Avatar'}
      </Button>
      <div class="flex-1"></div>
      <Button type="button" variant="secondary" onclick={() => (showEditAvatar = false)}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="form-edit-avatar"
        variant="primary"
        disabled={isAdminSubmitting || !editAvatarValue.trim()}
      >
        {isAdminSubmitting ? 'Saving...' : 'Save'}
      </Button>
    {:else}
      <Button
        type="button"
        variant="secondary"
        class="flex-1"
        onclick={() => (showEditAvatar = false)}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form="form-edit-avatar"
        variant="primary"
        class="flex-1"
        disabled={isAdminSubmitting || !editAvatarValue.trim()}
      >
        {isAdminSubmitting ? 'Saving...' : 'Set & Lock Avatar'}
      </Button>
    {/if}
  {/snippet}
</Dialog>

<!-- Admin: Manage Punishment Modal -->
<Dialog
  open={showPunish}
  title="Manage Status"
  onClose={() => {
    showPunish = false;
    punishSeverity = '';
  }}
>
  <div class="flex items-center gap-3 p-3 bg-surface-input rounded-lg mb-4">
    {#if player.avatar}
      <img src={player.avatar} alt={player.name} class="w-10 h-10 rounded" />
    {/if}
    <div>
      <p class="text-white font-medium">{player.name}</p>
      <p class="text-xs text-text-muted font-mono">{player.steamId}</p>
    </div>
    {#if getBanBadge(player.banStatus)}
      {@const badge = getBanBadge(player.banStatus)!}
      <span class="ml-auto px-2 py-0.5 text-xs font-bold rounded border {badge.classes}">
        {badge.label}
      </span>
    {/if}
  </div>

  <form
    id="form-punish"
    method="POST"
    action="?/punishUser"
    use:enhance={() => {
      isAdminSubmitting = true;
      return async ({ update, result }) => {
        await update();
        isAdminSubmitting = false;
        if (result.type === 'success') {
          showPunish = false;
          punishSeverity = '';
          toast.success((result.data as any)?.message || 'Status updated');
        } else if (result.type === 'failure') {
          toast.error((result.data as any)?.error || 'Failed to update status');
        }
      };
    }}
  >
    <div class="mb-4">
      <label for="punish-severity" class="block text-sm font-medium text-text-label mb-2">
        Status
      </label>
      <select
        id="punish-severity"
        name="severity"
        required
        bind:value={punishSeverity}
        class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
      >
        <option value="" disabled>Select status...</option>
        <option value="NONE">None (Clear punishment)</option>
        <option value="WARNING">Warning</option>
        <option value="SUSPENDED">Suspended</option>
        <option value="BANNED">Banned</option>
      </select>
    </div>

    {#if punishSeverity && punishSeverity !== 'NONE'}
      <div class="mb-4">
        <label for="punish-duration" class="block text-sm font-medium text-text-label mb-2">
          Duration (days)
        </label>
        <input
          id="punish-duration"
          name="duration"
          type="number"
          min="1"
          placeholder="Leave empty for permanent"
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
        />
        <p class="mt-1.5 text-xs text-text-muted">Leave empty for permanent punishment.</p>
      </div>

      <div class="mb-4">
        <label for="punish-reason" class="block text-sm font-medium text-text-label mb-2">
          Reason <span class="text-danger-500">*</span>
        </label>
        <textarea
          id="punish-reason"
          name="reason"
          rows="3"
          required
          placeholder="Explain why this user is being punished..."
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none"
        ></textarea>
      </div>
    {/if}

    {#if punishSeverity === 'NONE'}
      <div class="p-3 bg-success-500/10 border border-success-500/30 rounded-lg">
        <p class="text-success-400 text-xs">
          This will clear the user's punishment status and deactivate all active records.
        </p>
      </div>
    {:else if punishSeverity}
      <div class="p-3 bg-danger-500/10 border border-danger-500/30 rounded-lg">
        <p class="text-danger-400 text-xs">
          This will create a punishment record and update the user's ban status.
        </p>
      </div>
    {/if}
  </form>

  {#snippet footer()}
    <Button
      type="button"
      variant="secondary"
      class="flex-1"
      onclick={() => {
        showPunish = false;
        punishSeverity = '';
      }}
    >
      Cancel
    </Button>
    <Button
      type="submit"
      form="form-punish"
      variant={punishSeverity === 'NONE' ? 'success' : 'danger'}
      class="flex-1"
      disabled={isAdminSubmitting || !punishSeverity}
    >
      {isAdminSubmitting
        ? 'Applying...'
        : punishSeverity === 'NONE'
          ? 'Clear Punishment'
          : 'Apply Punishment'}
    </Button>
  {/snippet}
</Dialog>
