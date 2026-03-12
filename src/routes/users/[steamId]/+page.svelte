<script lang="ts">
import { enhance } from '$app/forms';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import PageHero from '$lib/components/layout/PageHero.svelte';
import { toast } from '$lib/state/toast.svelte';
import Dialog from '$lib/components/ui/Dialog.svelte';
import discordIcon from '$lib/assets/icons/discord.png';
import type { ProfileMatch } from '$lib/server/services/users';

interface TeamWithMatches {
  teamId: number;
  teamName: string;
  division: string;
  regionName: string;
  seasonNum: number;
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
  division: string;
  region: string;
  seasonNum: number;
  wins: number;
  losses: number;
  startedAt: Date | null;
  leftAt: Date | null;
  matches: ProfileMatch[];
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
    nameOverride: number;
    avatarOverride: number;
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
    region: string;
    seasonNum: number;
    wins: number;
    losses: number;
  } | null;
  entries1v1: Entry1v1WithMatches[];
}

let { data }: { data: PlayerData } = $props();

const player = $derived(data.player);
const currentTeams = $derived(data.currentTeams);
const teamHistory = $derived(data.teamHistory);
const tournaments = $derived(data.tournaments);
const fightNights = $derived(data.fightNights);
const achievements = $derived(data.achievements);
const isOwnProfile = $derived(data.isOwnProfile);
const isAdmin = $derived(data.isAdmin);
const current1v1Entry = $derived(data.current1v1Entry);
const entries1v1 = $derived(data.entries1v1);

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

$effect(() => {
	const discord = page.url.searchParams.get('discord');
	const error = page.url.searchParams.get('error');
	if (discord === 'linked') {
		toast.success('Discord account linked successfully!');
		goto(page.url.pathname, { replaceState: true });
	} else if (error === 'discord_auth_failed') {
		toast.error('Failed to link Discord account');
		goto(page.url.pathname, { replaceState: true });
	}
});

// Convert Steam64 to Steam2 ID format (STEAM_0:X:Y)
function steamIdToSteam2(steamId64: string): string {
  const id = BigInt(steamId64);
  const accountId = id - BigInt('76561197960265728');
  const y = accountId / BigInt(2);
  const x = accountId % BigInt(2);
  return `STEAM_0:${x}:${y}`;
}

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
    url: `https://stats.ugc-gaming.net/mge-stats/?search=${encodeURIComponent(steamIdToSteam2(player.steamId))}`,
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
  if (placement.includes('1st')) return 'text-yellow-400';
  if (placement.includes('2nd')) return 'text-gray-300';
  if (placement.includes('3rd')) return 'text-orange-400';
  return 'text-gray-400';
}

// Get result color
function getResultColor(result: string): string {
  if (result === 'W') return 'text-green-400';
  if (result === 'L') return 'text-red-400';
  return 'text-gray-400';
}

function getResultBg(result: string): string {
  if (result === 'W') return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (result === 'L') return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-zinc-800 text-gray-500 border-zinc-700';
}

function getBanBadge(status: string): { label: string; classes: string } | null {
  if (status === 'WARNING') return { label: 'Warning', classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  if (status === 'SUSPENDED') return { label: 'Suspended', classes: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  if (status === 'BANNED') return { label: 'Banned', classes: 'bg-red-500/20 text-red-400 border-red-500/30' };
  return null;
}

function openEditName() {
  editNameValue = player.nameOverride === 1 ? player.name : '';
  showEditName = true;
}

function openEditAvatar() {
  editAvatarValue = player.avatarOverride === 1 ? (player.avatar || '') : '';
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
						class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl"
					/>
					{#if isAdmin}
						<button
							type="button"
							onclick={openEditAvatar}
							class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-gray-400 hover:bg-blue-500/50 hover:border-blue-500/50 hover:text-white opacity-0 group-hover/avatar:opacity-100 transition-all"
							title="Edit Avatar (Admin)"
						>
							<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
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
						class="absolute -top-1 -right-4 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-gray-400 hover:bg-blue-500/50 hover:border-blue-500/50 hover:text-white opacity-0 group-hover/name:opacity-100 transition-all"
						title="Edit Name (Admin)"
					>
						<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
						</svg>
					</button>
				{/if}
			</div>
				
				<!-- External Links -->
				<div class="flex flex-wrap gap-2 justify-center">
					{#each externalLinks as link (link.name)}
						<a 
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 group"
							title={link.name}
						>
							<img src={link.logo} alt={link.name} class="w-5 h-5 {link.rounded ? 'rounded' : ''}" />
							<span class="text-xs text-gray-400 group-hover:text-white hidden sm:inline">
								{link.name}
							</span>
						</a>
					{/each}
				</div>
				
				<!-- Discord Status -->
				{#if player.discordLinked}
					<div class="relative inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-lg text-blue-400 text-sm group/discord">
						<img src={discordIcon} alt="Discord" class="w-4 h-4" />
						<span>{player.discordUsername || 'Discord linked'}</span>
						{#if isAdmin}
							<button 
								type="button"
								onclick={() => showUnlinkDiscordConfirm = true}
								disabled={isUnlinkingDiscord}
								class="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-gray-400 hover:bg-red-500/50 hover:border-red-500/50 hover:text-white opacity-0 group-hover/discord:opacity-100 transition-all disabled:opacity-50"
								title="Unlink Discord (Admin)"
							>
								<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
								</svg>
							</button>
						{/if}
					</div>
				{:else if isOwnProfile}
					<a 
						href="/auth/discord/login"
						class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors cursor-pointer"
					>
						<img src={discordIcon} alt="Discord" class="w-4 h-4" />
						<span>Link Discord Account</span>
					</a>
			{:else}
				<div class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-lg text-gray-400 text-sm">
					<img src={discordIcon} alt="Discord" class="w-4 h-4" />
					<span>Discord not linked</span>
				</div>
			{/if}

		</div>

		<!-- Admin Zone -->
		{#if isAdmin}
		<div class="max-w-xs mx-auto mt-4 pt-3 border-t border-zinc-800">
			<div class="flex items-center justify-center gap-2">
					<button
						type="button"
						onclick={openEditName}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 text-[11px] transition-colors cursor-pointer group/namebtn"
					>
						<span class="text-gray-500">Name</span>
						<span class="{player.nameOverride === 1 ? 'text-orange-400' : 'text-gray-400'}">{player.nameOverride === 1 ? 'Locked' : 'Auto'}</span>
						<svg class="w-2.5 h-2.5 text-gray-600 group-hover/namebtn:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
						</svg>
					</button>
				<button
					type="button"
					onclick={openEditAvatar}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 text-[11px] transition-colors cursor-pointer group/avatarbtn"
				>
					<span class="text-gray-500">Avatar</span>
					<span class="{player.avatarOverride === 1 ? 'text-orange-400' : 'text-gray-400'}">{player.avatarOverride === 1 ? 'Locked' : 'Auto'}</span>
					<svg class="w-2.5 h-2.5 text-gray-600 group-hover/avatarbtn:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
					</svg>
				</button>
				<button
					type="button"
					onclick={() => showPunish = true}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 text-[11px] transition-colors cursor-pointer group/statusbtn"
				>
					<span class="text-gray-500">Status</span>
						{#if getBanBadge(player.banStatus)}
							{@const badge = getBanBadge(player.banStatus)!}
							<span class="{badge.classes.split(' ').filter(c => c.startsWith('text-')).join(' ')}">{badge.label}</span>
						{:else}
							<span class="text-green-400">Clean</span>
						{/if}
						<svg class="w-2.5 h-2.5 text-gray-600 group-hover/statusbtn:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
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

				<!-- Achievements -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Achievements</h3>
					</div>
					{#if achievements.length > 0}
						<div class="divide-y divide-zinc-800/50">
							{#each achievements as achievement (achievement.event)}
								<div class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors">
									<div class="flex-shrink-0">
										<svg class="w-5 h-5 {achievement.placement === '1st Place' ? 'text-yellow-400' : 
											 achievement.placement === '2nd Place' ? 'text-gray-300' : 
											 achievement.placement === '3rd Place' ? 'text-orange-400' : 
											 'text-gray-500'}" 
											 fill="currentColor" viewBox="0 0 24 24">
											<path d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z"/>
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
										<p class="text-xs text-gray-500 mt-0.5">
											{formatDate(achievement.date)}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-4 py-6 text-center">
							<p class="text-gray-500 text-sm">No achievements yet</p>
						</div>
					{/if}
				</div>

				<!-- Tournaments -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Tournaments</h3>
					</div>
					{#if tournaments.length > 0}
						<div class="divide-y divide-zinc-800/50">
							{#each tournaments as t (t.id)}
								<div class="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors">
									<div class="min-w-0">
										<div class="text-sm text-white truncate">{t.name}</div>
										<div class="text-xs text-gray-600">{formatDate(t.date)}</div>
									</div>
									<span class="text-xs font-bold ml-3 whitespace-nowrap {getPlacementColor(t.placement)}">{t.placement}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-4 py-6 text-center text-gray-500 text-sm">No tournament history</div>
					{/if}
				</div>

				<!-- Fight Nights -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Fight Nights</h3>
					</div>
					{#if fightNights.length > 0}
						<div class="divide-y divide-zinc-800/50">
							{#each fightNights as fn (fn.id)}
								<div class="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors">
									<div class="min-w-0">
										<div class="text-sm text-white">{fn.fightNightName}</div>
										<div class="text-xs text-gray-500">vs {fn.opponent}</div>
									</div>
									<span class="text-xs font-bold font-mono ml-3 whitespace-nowrap {getResultColor(fn.result)}">
										{fn.result} {fn.score}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-4 py-6 text-center text-gray-500 text-sm">No Fight Night history</div>
					{/if}
				</div>

			</aside>

			<!-- Main Content -->
			<main class="lg:col-span-9 space-y-6">

				<!-- 1v1 League -->
				{#if entries1v1.length > 0 || current1v1Entry}
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-purple-800/50 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-purple-800/50">
						<h2 class="text-2xl font-bold text-white">1v1 League</h2>
						<p class="text-sm text-gray-400 mt-1">Individual Competition</p>
					</div>

					<div class="divide-y divide-zinc-800/50">
						{#each entries1v1 as entry (entry.id)}
							{@const isOpen = expanded1v1[entry.id] ?? entry.active}
							{@const pct = winPct(entry.wins, entry.losses)}

							<div>
								<div class="flex items-center {entry.active ? 'bg-purple-500/5' : 'opacity-70'}">
									<button
										type="button"
										onclick={() => expanded1v1[entry.id] = !isOpen}
										class="flex-1 flex items-center justify-between px-6 py-4 hover:bg-zinc-800/30 transition-colors text-left"
									>
										<div class="flex items-center gap-4">
											<span class="text-xs font-bold px-2 py-1 rounded border whitespace-nowrap {entry.active ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-zinc-800 text-gray-500 border-zinc-700'}">
												S{entry.seasonNum}
											</span>
											<div>
												<span class="font-semibold text-white text-sm">
													{entry.division}
													<span class="text-gray-500 font-normal ml-1">· {entry.region}</span>
												</span>
												<div class="flex items-center gap-3 mt-0.5">
													<span class="text-sm font-mono {entry.active ? 'text-purple-400' : 'text-gray-400'}">
														{entry.wins}–{entry.losses}
													</span>
													<span class="text-xs text-gray-600">{pct}% WR</span>
													{#if entry.active}
														<span class="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/30">Active</span>
													{/if}
												</div>
											</div>
										</div>
										<svg class="w-4 h-4 text-gray-600 transition-transform duration-200 flex-shrink-0 {isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
										</svg>
									</button>
									{#if isOwnProfile && entry.active}
										<div class="pr-4">
											<button
												type="button"
												class="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/30 transition-colors whitespace-nowrap"
												onclick={() => withdrawingEntry = entry}
											>
												Withdraw
											</button>
										</div>
									{/if}
								</div>

								{#if isOpen}
									<div class="border-t border-zinc-800/50">
										{#if entry.matches.length > 0}
											<table class="w-full text-sm">
												<thead>
													<tr class="bg-zinc-950/60 text-xs text-gray-600 uppercase tracking-wide">
														<th class="text-left px-6 py-2 font-medium">Week</th>
														<th class="text-left px-6 py-2 font-medium">Opponent</th>
														<th class="text-center px-6 py-2 font-medium">Result</th>
														<th class="text-center px-6 py-2 font-medium">Score</th>
													</tr>
												</thead>
												<tbody>
													{#each entry.matches as match (match.matchId)}
														<tr class="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition-colors {match.result === 'TBD' ? 'opacity-50' : ''}">
															<td class="px-6 py-2.5 text-gray-500 text-xs whitespace-nowrap">{match.week}</td>
															<td class="px-6 py-2.5">
																{#if match.opponentId}
																	<a href="/users/{match.opponentId}" class="text-white hover:text-blue-400 transition-colors font-medium text-sm">
																		{match.opponentName}
																	</a>
																{:else}
																	<span class="text-gray-600 italic text-sm">TBD</span>
																{/if}
															</td>
															<td class="px-6 py-2.5 text-center">
																<span class="inline-block px-2 py-0.5 rounded text-xs font-bold border {getResultBg(match.result)}">
																	{match.result}
																</span>
															</td>
															<td class="px-6 py-2.5 text-center font-mono text-xs {getResultColor(match.result)}">
																{match.score}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{:else}
											<div class="px-6 py-4 text-sm text-gray-500">No matches scheduled yet.</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
				{/if}

				<!-- 2v2 League -->
				{#if teams2v2.length > 0}
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-2xl font-bold text-white">2v2 League</h2>
						<p class="text-sm text-gray-400 mt-1">Team Competition</p>
					</div>

					<div class="divide-y divide-zinc-800/50">
						{#each teams2v2 as team (team.teamId)}
							{@const isOpen = expanded2v2[team.teamId] ?? team.active}
							{@const pct = winPct(team.wins, team.losses)}

							<div>
								<button
									type="button"
									onclick={() => expanded2v2[team.teamId] = !isOpen}
									class="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-800/30 transition-colors text-left {team.active ? 'bg-green-500/5' : 'opacity-70'}"
								>
									<div class="flex items-center gap-4">
										<span class="text-xs font-bold px-2 py-1 rounded border whitespace-nowrap {team.active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-800 text-gray-500 border-zinc-700'}">
											S{team.seasonNum}
										</span>
										<div>
											<span class="font-semibold text-white text-sm">
												<a
													href="/teams/{team.teamId}"
													class="hover:text-blue-400 transition-colors"
													onclick={(e) => e.stopPropagation()}
												>
													{team.teamName}
												</a>
												<span class="text-gray-500 font-normal ml-1">· {team.division} · {team.regionName}</span>
											</span>
											<div class="flex items-center gap-3 mt-0.5">
												<span class="text-sm font-mono {team.active ? 'text-green-400' : 'text-gray-400'}">
													{team.wins}–{team.losses}
												</span>
												<span class="text-xs text-gray-600">{pct}% WR</span>
												{#if team.active}
													<span class="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/30">Active</span>
												{/if}
											</div>
										</div>
									</div>
									<svg class="w-4 h-4 text-gray-600 transition-transform duration-200 flex-shrink-0 {isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								</button>

								{#if isOpen}
									<div class="border-t border-zinc-800/50">
										{#if team.matches.length > 0}
											<table class="w-full text-sm">
												<thead>
													<tr class="bg-zinc-950/60 text-xs text-gray-600 uppercase tracking-wide">
														<th class="text-left px-6 py-2 font-medium">Week</th>
														<th class="text-left px-6 py-2 font-medium">Opponent</th>
														<th class="text-center px-6 py-2 font-medium">Result</th>
														<th class="text-center px-6 py-2 font-medium">Score</th>
													</tr>
												</thead>
												<tbody>
													{#each team.matches as match (match.matchId)}
														<tr class="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition-colors {match.result === 'TBD' ? 'opacity-50' : ''}">
															<td class="px-6 py-2.5 text-gray-500 text-xs whitespace-nowrap">{match.week}</td>
															<td class="px-6 py-2.5">
																{#if match.opponentId}
																	<a href="/teams/{match.opponentId}" class="text-white hover:text-blue-400 transition-colors font-medium text-sm">
																		{match.opponentName}
																	</a>
																{:else}
																	<span class="text-gray-600 italic text-sm">TBD</span>
																{/if}
															</td>
															<td class="px-6 py-2.5 text-center">
																<span class="inline-block px-2 py-0.5 rounded text-xs font-bold border {getResultBg(match.result)}">
																	{match.result}
																</span>
															</td>
															<td class="px-6 py-2.5 text-center font-mono text-xs {getResultColor(match.result)}">
																{match.score}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{:else}
											<div class="px-6 py-4 text-sm text-gray-500">No matches scheduled yet.</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
				{/if}

			</main>
		</div>
	</div>
</div>

<!-- Discord Unlink Confirmation Modal -->
<Dialog
	open={showUnlinkDiscordConfirm}
	title="Unlink Discord Account"
	onClose={() => showUnlinkDiscordConfirm = false}
>
	<p class="text-gray-400 mb-4">
		Are you sure you want to unlink <span class="text-white font-medium">{player.name}</span>'s Discord account?
	</p>

	{#if player.discordUsername}
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			<div class="flex items-center gap-2">
				<img src={discordIcon} alt="Discord" class="w-4 h-4" />
				<span class="text-green-400 text-sm">{player.discordUsername}</span>
			</div>
		</div>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			onclick={() => showUnlinkDiscordConfirm = false}
			class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
		>
			Cancel
		</button>
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
						toast.error(result.data?.error as string || 'Failed to unlink Discord');
					}
				};
			}}
			class="flex-1"
		>
			<button
				type="submit"
				disabled={isUnlinkingDiscord}
				class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{isUnlinkingDiscord ? 'Unlinking...' : 'Unlink Discord'}
			</button>
		</form>
	{/snippet}
</Dialog>

<!-- 1v1 Withdrawal Confirmation Modal -->
<Dialog
	open={!!withdrawingEntry}
	title="Withdraw from 1v1 League"
	onClose={() => withdrawingEntry = null}
>
	<p class="text-gray-400 mb-4">
		Are you sure you want to withdraw from the 1v1 league? This action cannot be undone.
	</p>

	{#if withdrawingEntry}
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			<div class="flex justify-between text-sm">
				<span class="text-gray-400">Division:</span>
				<span class="text-white">{withdrawingEntry.division}</span>
			</div>
			<div class="flex justify-between text-sm mt-1">
				<span class="text-gray-400">Region:</span>
				<span class="text-white">{withdrawingEntry.region}</span>
			</div>
			<div class="flex justify-between text-sm mt-1">
				<span class="text-gray-400">Season:</span>
				<span class="text-white">S{withdrawingEntry.seasonNum}</span>
			</div>
			<div class="flex justify-between text-sm mt-1">
				<span class="text-gray-400">Record:</span>
				<span class="text-white">{withdrawingEntry.wins}-{withdrawingEntry.losses}</span>
			</div>
		</div>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			onclick={() => withdrawingEntry = null}
			class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
		>
			Cancel
		</button>
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
				<button
					type="submit"
					disabled={isWithdrawing}
					class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
				</button>
			</form>
		{/if}
	{/snippet}
</Dialog>

<!-- Admin: Edit Name Modal -->
<Dialog
	open={showEditName}
	title={player.nameOverride === 1 ? 'Manage Locked Name' : 'Set Custom Name'}
	onClose={() => showEditName = false}
>
	<div class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg mb-4">
		{#if player.avatar}
			<img src={player.avatar} alt={player.name} class="w-10 h-10 rounded" />
		{/if}
		<div>
			<p class="text-white font-medium">{player.name}</p>
			<p class="text-xs text-gray-500 font-mono">{player.steamId}</p>
		</div>
		{#if player.nameOverride === 1}
			<span class="ml-auto px-2 py-0.5 text-[10px] font-bold rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
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
				<label for="edit-name" class="block text-sm font-medium text-gray-300 mb-2">
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
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>
		</form>

		<div class="border-t border-zinc-800 pt-4 mt-4">
			<p class="text-xs text-gray-500">Or unlock the name to let it sync from Steam on next login.</p>
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
		<p class="text-sm text-gray-400 mb-4">
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
				<label for="edit-name-new" class="block text-sm font-medium text-gray-300 mb-2">
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
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>
		</form>
	{/if}

	{#snippet footer()}
		{#if player.nameOverride === 1}
			<button
				type="submit"
				form="form-unlock-name"
				disabled={isAdminSubmitting}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
			>
				{isAdminSubmitting ? 'Unlocking...' : 'Unlock Name'}
			</button>
			<div class="flex-1"></div>
			<button
				type="button"
				onclick={() => showEditName = false}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="form-lock-name"
				disabled={isAdminSubmitting || !editNameValue.trim() || editNameValue.trim() === player.name}
				class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
			>
				{isAdminSubmitting ? 'Saving...' : 'Save'}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => showEditName = false}
				class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="form-lock-name"
				disabled={isAdminSubmitting || !editNameValue.trim()}
				class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
			>
				{isAdminSubmitting ? 'Saving...' : 'Set & Lock Name'}
			</button>
		{/if}
	{/snippet}
</Dialog>

<!-- Admin: Edit Avatar Modal -->
<Dialog
	open={showEditAvatar}
	title={player.avatarOverride === 1 ? 'Avatar (Locked)' : 'Set Avatar'}
	onClose={() => showEditAvatar = false}
>
	<div class="flex items-center gap-4 mb-4">
		<div class="flex-shrink-0">
			<p class="text-xs text-gray-500 mb-1">Current</p>
			{#if player.avatar}
				<img src={player.avatar} alt={player.name} class="w-16 h-16 rounded-lg border border-zinc-700" />
			{:else}
				<div class="w-16 h-16 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center text-gray-500 text-xs">None</div>
			{/if}
		</div>
		{#if editAvatarValue.trim()}
			<div class="flex-shrink-0">
				<p class="text-xs text-gray-500 mb-1">Preview</p>
				<img
					src={editAvatarValue}
					alt="Preview"
					class="w-16 h-16 rounded-lg border border-zinc-700 object-cover"
					onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
			<label for="edit-avatar" class="block text-sm font-medium text-gray-300 mb-2">
				Avatar URL
			</label>
			<input
				id="edit-avatar"
				name="avatarUrl"
				type="url"
				bind:value={editAvatarValue}
				placeholder="https://example.com/avatar.png"
				class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
			/>
			{#if player.avatarOverride === 0}
				<p class="mt-1.5 text-xs text-gray-500">Setting an avatar URL will lock it, preventing Steam from overwriting it on login.</p>
			{/if}
		</div>
	</form>

	{#if player.avatarOverride === 1}
		<div class="border-t border-zinc-800 pt-4 mt-4">
			<p class="text-xs text-gray-500">Or unlock the avatar to let it sync from Steam on next login.</p>
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
			<button
				type="submit"
				form="form-unlock-avatar"
				disabled={isAdminSubmitting}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
			>
				{isAdminSubmitting ? 'Unlocking...' : 'Unlock Avatar'}
			</button>
			<div class="flex-1"></div>
			<button
				type="button"
				onclick={() => showEditAvatar = false}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="form-edit-avatar"
				disabled={isAdminSubmitting || !editAvatarValue.trim()}
				class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
			>
				{isAdminSubmitting ? 'Saving...' : 'Save'}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => showEditAvatar = false}
				class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="form-edit-avatar"
				disabled={isAdminSubmitting || !editAvatarValue.trim()}
				class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
			>
				{isAdminSubmitting ? 'Saving...' : 'Set & Lock Avatar'}
			</button>
		{/if}
	{/snippet}
</Dialog>

<!-- Admin: Manage Punishment Modal -->
<Dialog
	open={showPunish}
	title="Manage Status"
	onClose={() => { showPunish = false; punishSeverity = ''; }}
>
	<div class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg mb-4">
		{#if player.avatar}
			<img src={player.avatar} alt={player.name} class="w-10 h-10 rounded" />
		{/if}
		<div>
			<p class="text-white font-medium">{player.name}</p>
			<p class="text-xs text-gray-500 font-mono">{player.steamId}</p>
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
			<label for="punish-severity" class="block text-sm font-medium text-gray-300 mb-2">
				Status
			</label>
			<select
				id="punish-severity"
				name="severity"
				required
				bind:value={punishSeverity}
				class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
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
				<label for="punish-duration" class="block text-sm font-medium text-gray-300 mb-2">
					Duration (days)
				</label>
				<input
					id="punish-duration"
					name="duration"
					type="number"
					min="1"
					placeholder="Leave empty for permanent"
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
				<p class="mt-1.5 text-xs text-gray-500">Leave empty for permanent punishment.</p>
			</div>

			<div class="mb-4">
				<label for="punish-reason" class="block text-sm font-medium text-gray-300 mb-2">
					Reason <span class="text-red-500">*</span>
				</label>
				<textarea
					id="punish-reason"
					name="reason"
					rows="3"
					required
					placeholder="Explain why this user is being punished..."
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors resize-none"
				></textarea>
			</div>
		{/if}

		{#if punishSeverity === 'NONE'}
			<div class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
				<p class="text-green-400 text-xs">
					This will clear the user's punishment status and deactivate all active records.
				</p>
			</div>
		{:else if punishSeverity}
			<div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
				<p class="text-red-400 text-xs">
					This will create a punishment record and update the user's ban status.
				</p>
			</div>
		{/if}
	</form>

	{#snippet footer()}
		<button
			type="button"
			onclick={() => { showPunish = false; punishSeverity = ''; }}
			class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
		>
			Cancel
		</button>
		<button
			type="submit"
			form="form-punish"
			disabled={isAdminSubmitting || !punishSeverity}
			class="flex-1 px-4 py-2 {punishSeverity === 'NONE' ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-600/50' : 'bg-red-600 hover:bg-red-500 disabled:bg-red-600/50'} disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
		>
			{isAdminSubmitting ? 'Applying...' : punishSeverity === 'NONE' ? 'Clear Punishment' : 'Apply Punishment'}
		</button>
	{/snippet}
</Dialog>
