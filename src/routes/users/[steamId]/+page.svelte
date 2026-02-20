<script lang="ts">
import { enhance } from '$app/forms';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { toast } from '$lib/state/toast.svelte';
import DataTable from '$lib/components/ui/DataTable.svelte';
import Dialog from '$lib/components/ui/Dialog.svelte';
import discordIcon from '$lib/assets/icons/discord.png';

// Get data from server load function (Svelte 5 syntax)
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
  };
  isOwnProfile: boolean;
  isAdmin: boolean;
  currentTeams: Array<{
    teamId: number;
    teamName: string;
    division: string;
    regionName: string;
    seasonNum: number;
    totalRecord: string;
    joined: Date;
  }>;
  teamHistory: Array<{
    teamId: number;
    teamName: string;
    division: string;
    regionName: string;
    seasonNum: number;
    totalRecord: string;
    joined: Date;
    left: Date | null;
  }>;
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
  entries1v1: Array<{
    id: number;
    active: boolean;
    division: string;
    region: string;
    seasonNum: number;
    wins: number;
    losses: number;
    startedAt: Date | null;
    leftAt: Date | null;
  }>;
}

let { data }: { data: PlayerData } = $props();

// Destructure data - use $derived to react to data changes when navigating between player profiles
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

// Table column definitions
const entries1v1Columns = $derived([
	{ key: 'division', label: 'Division' },
	{ key: 'region', label: 'Region' },
	{ key: 'season', label: 'Season' },
	{ key: 'record', label: 'Record' },
	{ key: 'status', label: 'Status' },
	...(isOwnProfile ? [{ key: 'actions', label: 'Actions' }] : [])
]);

const currentTeamsColumns = [
	{ key: 'team', label: 'Team' },
	{ key: 'division', label: 'Division' },
	{ key: 'region', label: 'Region' },
	{ key: 'season', label: 'Season' },
	{ key: 'record', label: 'Record' },
	{ key: 'joined', label: 'Joined' }
];

const teamHistoryColumns = [
	{ key: 'team', label: 'Team' },
	{ key: 'division', label: 'Division' },
	{ key: 'region', label: 'Region' },
	{ key: 'season', label: 'Season' },
	{ key: 'record', label: 'Record' },
	{ key: 'period', label: 'Period' }
];

const tournamentsColumns = [
	{ key: 'tournament', label: 'Tournament' },
	{ key: 'date', label: 'Date' },
	{ key: 'placement', label: 'Placement' }
];

const fightNightsColumns = [
	{ key: 'event', label: 'Event' },
	{ key: 'opponent', label: 'Opponent' },
	{ key: 'result', label: 'Result' },
	{ key: 'date', label: 'Date' }
];

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
  editAvatarValue = player.avatar || '';
  showEditAvatar = true;
}
</script>

<div class="min-h-screen pb-16">
	<!-- Player Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
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
					{#each externalLinks as link}
						<a 
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 group"
							title={link.name}
						>
							<img src={link.logo} alt={link.name} class="w-5 h-5 {link.name === 'SteamHistory' ? 'rounded' : ''}" />
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
		</div>

		<!-- Admin Zone -->
		{#if isAdmin}
			<div class="border-t border-zinc-800 mt-6 pt-4">
				<div class="max-w-6xl mx-auto flex items-center justify-center gap-2">
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
	</section>
	
	<!-- Main Content - Sidebar Layout -->
	<div class="max-w-[1600px] mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
			
			<!-- Left Sidebar - Achievements -->
			<aside class="lg:col-span-3 space-y-6">
				<!-- Achievements Card -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Achievements</h3>
					</div>
					
					{#if achievements.length > 0}
						<div class="divide-y divide-zinc-800/50">
							{#each achievements as achievement}
								<div class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors">
									<!-- Trophy Icon -->
									<div class="flex-shrink-0">
										<svg class="w-5 h-5 {achievement.placement === '1st' ? 'text-yellow-400' : 
											 achievement.placement === '2nd' ? 'text-gray-300' : 
											 achievement.placement === '3rd' ? 'text-orange-400' : 
											 'text-gray-500'}" 
											 fill="currentColor" viewBox="0 0 24 24">
											<path d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z"/>
										</svg>
									</div>
									
									<!-- Event Info -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-xs font-bold {achievement.placement === '1st' ? 'text-yellow-400' : 
												 achievement.placement === '2nd' ? 'text-gray-300' : 
												 achievement.placement === '3rd' ? 'text-orange-400' : 
												 'text-gray-500'}">
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
				
			</aside>
			
			<!-- Main Content - Teams & Tournaments -->
			<main class="lg:col-span-9 space-y-6">
				
				<!-- 1v1 League Section -->
				{#if current1v1Entry || entries1v1.length > 0}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-purple-800/50 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-purple-800/50">
							<h2 class="text-2xl font-bold text-white">1v1 League</h2>
							<p class="text-sm text-gray-400 mt-1">Individual Competition</p>
						</div>
						
						<DataTable
							data={entries1v1}
							columns={entries1v1Columns}
							headerClass="bg-zinc-950/50"
							rowClass={(entry) => entry.active ? 'bg-purple-500/5' : 'opacity-60'}
						>
							{#snippet cell(entry, col)}
								{#if col.key === 'division'}
									<span class="text-gray-300 text-sm">{entry.division}</span>
								{:else if col.key === 'region'}
									<span class="text-gray-300 text-sm">{entry.region}</span>
								{:else if col.key === 'season'}
									<span class="px-2 py-0.5 {entry.active ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-zinc-800 text-gray-400'} text-xs rounded border">
										S{entry.seasonNum}
									</span>
								{:else if col.key === 'record'}
									<span class="{entry.active ? 'text-purple-400' : 'text-gray-400'} text-sm font-medium">{entry.wins}-{entry.losses}</span>
								{:else if col.key === 'status'}
									{#if entry.active}
										<span class="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30">
											Active
										</span>
									{:else}
										<span class="text-gray-500 text-sm">
											Ended {formatDate(entry.leftAt)}
										</span>
									{/if}
								{:else if col.key === 'actions'}
									{#if entry.active}
										<button 
											type="button"
											class="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded border border-red-500/30 transition-colors"
											onclick={() => withdrawingEntry = entry}
										>
											Withdraw
										</button>
									{/if}
								{/if}
							{/snippet}
						</DataTable>
					</div>
				{/if}
				
				<!-- Current Teams Section -->
				{#if currentTeams.length > 0}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-2xl font-bold text-white">Current Teams</h2>
							<p class="text-sm text-gray-400 mt-1">2v2 League</p>
						</div>
						
						<DataTable
							data={currentTeams}
							columns={currentTeamsColumns}
							headerClass="bg-zinc-950/50"
							rowClass={() => 'bg-green-500/5'}
						>
							{#snippet cell(team, col)}
								{#if col.key === 'team'}
									<a 
										href="/teams/{team.teamId}" 
										class="text-white font-medium hover:text-blue-400 transition-colors text-sm"
									>
										{team.teamName}
									</a>
								{:else if col.key === 'division'}
									<span class="text-gray-300 text-sm">{team.division}</span>
								{:else if col.key === 'region'}
									<span class="text-gray-300 text-sm">{team.regionName}</span>
								{:else if col.key === 'season'}
									<span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30">
										S{team.seasonNum}
									</span>
								{:else if col.key === 'record'}
									<span class="text-green-400 text-sm font-medium">{team.totalRecord}</span>
								{:else if col.key === 'joined'}
									<span class="text-gray-400 text-sm">{formatDate(team.joined)}</span>
								{/if}
							{/snippet}
						</DataTable>
					</div>
				{/if}
				
				<!-- Team History Section -->
				{#if teamHistory.length > 0}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-2xl font-bold text-white">Team History</h2>
						</div>
						
						<DataTable
							data={teamHistory}
							columns={teamHistoryColumns}
							headerClass="bg-zinc-950/50"
							rowClass={() => 'opacity-60'}
						>
							{#snippet cell(team, col)}
								{#if col.key === 'team'}
									<a 
										href="/teams/{team.teamId}" 
										class="text-white font-medium hover:text-blue-400 transition-colors text-sm"
									>
										{team.teamName}
									</a>
								{:else if col.key === 'division'}
									<span class="text-gray-300 text-sm">{team.division}</span>
								{:else if col.key === 'region'}
									<span class="text-gray-300 text-sm">{team.regionName}</span>
								{:else if col.key === 'season'}
									<span class="px-2 py-0.5 bg-zinc-800 text-gray-400 text-xs rounded">
										S{team.seasonNum}
									</span>
								{:else if col.key === 'record'}
									<span class="text-gray-400 text-sm">{team.totalRecord}</span>
								{:else if col.key === 'period'}
									<span class="text-gray-500 text-sm">{formatDate(team.joined)} - {formatDate(team.left)}</span>
								{/if}
							{/snippet}
						</DataTable>
					</div>
				{/if}
				
				<!-- Tournaments Section -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-2xl font-bold text-white">Tournaments</h2>
					</div>
					
					<DataTable
						data={tournaments}
						columns={tournamentsColumns}
						headerClass="bg-zinc-950/50"
						emptyMessage="No tournament participation recorded"
					>
						{#snippet cell(tournament, col)}
							{#if col.key === 'tournament'}
								<span class="text-white font-medium text-sm">{tournament.name}</span>
							{:else if col.key === 'date'}
								<span class="text-gray-400 text-sm">{formatDate(tournament.date)}</span>
							{:else if col.key === 'placement'}
								<span class="{getPlacementColor(tournament.placement)} text-sm font-bold">
									{tournament.placement}
								</span>
							{/if}
						{/snippet}
					</DataTable>
				</div>
				
				<!-- Fight Nights Section -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-2xl font-bold text-white">Fight Nights</h2>
					</div>
					
					<DataTable
						data={fightNights}
						columns={fightNightsColumns}
						headerClass="bg-zinc-950/50"
						emptyMessage="No Fight Night participation recorded"
					>
						{#snippet cell(fight, col)}
							{#if col.key === 'event'}
								<a 
									href="/fightnight/{fight.id}"
									class="text-white font-medium text-sm hover:text-blue-400 transition-colors"
								>
									{fight.fightNightName}
								</a>
							{:else if col.key === 'opponent'}
								<span class="text-gray-300 text-sm">{fight.opponent}</span>
							{:else if col.key === 'result'}
								<span class="{getResultColor(fight.result)} text-sm font-bold">
									{fight.result} ({fight.score})
								</span>
							{:else if col.key === 'date'}
								<span class="text-gray-400 text-sm">{formatDate(fight.date)}</span>
							{/if}
						{/snippet}
					</DataTable>
				</div>
				
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
	title="Edit Avatar"
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
		action="?/updateAvatar"
		use:enhance={() => {
			isAdminSubmitting = true;
			return async ({ update, result }) => {
				await update();
				isAdminSubmitting = false;
				if (result.type === 'success') {
					showEditAvatar = false;
					toast.success('Avatar updated');
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
			<p class="mt-1.5 text-xs text-gray-500">Leave empty to clear the avatar. Steam avatars refresh on next login.</p>
		</div>
	</form>

	{#snippet footer()}
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
			disabled={isAdminSubmitting}
			class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
		>
			{isAdminSubmitting ? 'Saving...' : 'Update Avatar'}
		</button>
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