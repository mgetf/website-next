<script lang="ts">
import { enhance } from '$app/forms';
import DataTable from '$lib/components/ui/DataTable.svelte';
import Dialog from '$lib/components/ui/Dialog.svelte';

// Get data from server load function (Svelte 5 syntax)
interface PlayerData {
  player: {
    steamId: string;
    name: string;
    avatar: string | null;
    discordLinked: boolean;
    discordUsername: string | null;
    permissionLevel: string;
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
</script>

<div class="min-h-screen pb-16">
	<!-- Player Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
			<div class="flex flex-col items-center gap-4">
				<!-- Player Avatar -->
				<div class="flex-shrink-0">
					<img 
						src={player.avatar} 
						alt={player.name} 
						class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl"
					/>
				</div>
				
				<!-- Player Name -->
				<h1 class="text-5xl font-black text-white">
					{player.name}
				</h1>
				
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
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>{player.discordUsername || 'Discord linked'}</span>
						{#if isAdmin}
							<form 
								method="POST" 
								action="?/unlinkDiscord"
								use:enhance={() => {
									isUnlinkingDiscord = true;
									return async ({ update }) => {
										await update();
										isUnlinkingDiscord = false;
									};
								}}
								class="absolute -top-1 -right-1"
							>
								<button 
									type="submit"
									disabled={isUnlinkingDiscord}
									class="w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-gray-400 hover:bg-red-500/50 hover:border-red-500/50 hover:text-white opacity-0 group-hover/discord:opacity-100 transition-all disabled:opacity-50"
									title="Unlink Discord (Admin)"
								>
									<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
									</svg>
								</button>
							</form>
						{/if}
					</div>
				{:else if isOwnProfile}
					<a 
						href="/auth/discord/login"
						class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors cursor-pointer"
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>Link Discord Account</span>
					</a>
				{:else}
					<div class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-lg text-gray-400 text-sm">
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>Discord not linked</span>
					</div>
				{/if}
				
			</div>
		</div>
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