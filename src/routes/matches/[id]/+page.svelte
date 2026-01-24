<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showDisputeForm = $state(false);
	let showRescheduleForm = $state(false);
	let showDemoUploadModal = $state(false);
	let showDemoReportModal = $state(false);
	let selectedDemoForReport = $state<any>(null);
	let messageContent = $state('');
	let scoreSubmitError = $state<string | null>(null);
	let scoreSubmitSuccess = $state(false);
	let isSubmittingScore = $state(false);
	let isSubmittingMessage = $state(false);
	let isUploadingDemo = $state(false);
	let isReportingDemo = $state(false);
	
	// Demo upload state
	let selectedDemoFile = $state<File | null>(null);
	let demoUploadError = $state<string | null>(null);
	let demoUploadProgress = $state<string>('Preparing upload...');

	// Score submission state - track scores as user types
	let gameScores = $state<{ home: number | null; away: number | null }[]>([]);
	
	// Initialize gameScores when match changes
	$effect(() => {
		const boSeries = data.match.boSeries || 3;
		if (gameScores.length !== boSeries) {
			gameScores = Array(boSeries).fill(null).map(() => ({ home: null, away: null }));
		}
	});
	
	// Calculate games won by each team based on current scores
	const gamesWonByTeam = $derived(() => {
		let homeWins = 0;
		let awayWins = 0;
		
		for (const game of gameScores) {
			if (game.home !== null && game.away !== null) {
				if (game.home > game.away) homeWins++;
				else if (game.away > game.home) awayWins++;
			}
		}
		
		return { home: homeWins, away: awayWins };
	});
	
	// Calculate how many games needed to win the series
	const gamesToWin = $derived(Math.ceil((data.match.boSeries || 3) / 2));
	
	// Determine if the match is already decided (one team has enough wins)
	const matchDecided = $derived(() => {
		const wins = gamesWonByTeam();
		return wins.home >= gamesToWin || wins.away >= gamesToWin;
	});
	
	// Determine which game number the match was decided at (first game where a team reached winning threshold)
	const matchDecidedAtGame = $derived(() => {
		let homeWins = 0;
		let awayWins = 0;
		
		for (let i = 0; i < gameScores.length; i++) {
			const game = gameScores[i];
			if (game.home !== null && game.away !== null) {
				if (game.home > game.away) homeWins++;
				else if (game.away > game.home) awayWins++;
				
				if (homeWins >= gamesToWin || awayWins >= gamesToWin) {
					return i; // Return the index where match was decided
				}
			}
		}
		
		return null; // Match not yet decided
	});
	
	// Check if a specific game should be disabled
	// A game is disabled if:
	// 1. The match is already decided before this game, OR
	// 2. Any previous game hasn't been filled yet (enforce sequential order)
	const isGameDisabled = (gameIndex: number) => {
		// Check if match was decided before this game
		const decidedAt = matchDecidedAtGame();
		if (decidedAt !== null && gameIndex > decidedAt) {
			return true;
		}
		
		// Check if all previous games are filled (enforce order)
		for (let i = 0; i < gameIndex; i++) {
			const prevGame = gameScores[i];
			if (prevGame?.home === null || prevGame?.away === null) {
				return true; // Previous game not filled, disable this one
			}
		}
		
		return false;
	};

	const match = $derived(data.match);
	const isUnplayed = $derived(match.status === 'UNPLAYED');
	const isPlayed = $derived(match.status === 'PLAYED');
	const isDisputed = $derived(match.status === 'DISPUTE');

	// Helper to get participant name (player name for 1v1, team name for 2v2)
	const getHomeName = () => match.is1v1 && match.homePlayer ? match.homePlayer.steamUsername : match.homeTeam.name;
	const getAwayName = () => match.is1v1 && match.awayPlayer ? match.awayPlayer.steamUsername : match.awayTeam.name;
	
	// Get unique arenas with full data (id, name, avatar)
	const matchArenas = $derived(() => {
		const seen = new Set<number>();
		return match.games
			.filter(g => g.arena && !seen.has(g.arena.id) && seen.add(g.arena.id))
			.map(g => g.arena!);
	});
	
	const canSubmitScores = $derived(
		isUnplayed && (data.permissions.isHomeOwner || data.permissions.isAwayOwner || data.permissions.isAdmin)
	);

	const canDispute = $derived(
		data.canDispute && (data.permissions.isHomeOwner || data.permissions.isAwayOwner)
	);

	const getStatusBadge = (status: string) => {
		if (status === 'UNPLAYED') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
		if (status === 'PLAYED') return 'bg-green-500/20 text-green-300 border border-green-500/30';
		if (status === 'DISPUTE') return 'bg-red-500/20 text-red-300 border border-red-500/30';
		return 'bg-zinc-800 text-gray-300 border border-zinc-700';
	};

	const getStatusLabel = (status: string) => {
		if (status === 'UNPLAYED') return 'Unplayed';
		if (status === 'PLAYED') return 'Played';
		if (status === 'DISPUTE') return 'Disputed';
		return 'Unknown';
	};

	// Map ban/pick state
	const mapBanActive = $derived(
		data.mapBanStatus && !data.mapBanStatus.isComplete && isUnplayed
	);
	const isUserTurn = $derived(() => {
		if (!mapBanActive || !data.mapBanStatus) return false;
		const currentTurn = data.mapBanStatus.matchMapBan.currentTurn;
		const expectedTeamId = currentTurn === 0 ? match.homeTeamId : match.awayTeamId;
		
		if (data.permissions.isHomeOwner && expectedTeamId === match.homeTeamId) return true;
		if (data.permissions.isAwayOwner && expectedTeamId === match.awayTeamId) return true;
		return false;
	});

	// Demo modal functions
	const openDemoUploadModal = () => {
		showDemoUploadModal = true;
		selectedDemoFile = null;
		demoUploadError = null;
		demoUploadProgress = 'Preparing upload...';
	};

	const closeDemoUploadModal = () => {
		showDemoUploadModal = false;
		selectedDemoFile = null;
		demoUploadError = null;
	};

	const handleDemoFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0] || null;
		selectedDemoFile = file;
		demoUploadError = null;
		
		// Client-side validation
		if (file) {
			const maxSize = 200 * 1024 * 1024; // 200MB
			if (file.size > maxSize) {
				demoUploadError = `File too large (${formatFileSize(file.size)}). Maximum size is 200MB.`;
				selectedDemoFile = null;
				input.value = '';
			} else if (!file.name.toLowerCase().endsWith('.dem')) {
				demoUploadError = 'Invalid file type. Only .dem files are allowed.';
				selectedDemoFile = null;
				input.value = '';
			}
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	};

	const openDemoReportModal = (demo: any) => {
		selectedDemoForReport = demo;
		showDemoReportModal = true;
	};

	const closeDemoReportModal = () => {
		showDemoReportModal = false;
		selectedDemoForReport = null;
	};

	const getDemoReportStatusBadge = (status: string) => {
		if (status === 'REVIEW') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
		if (status === 'ACTION') return 'bg-green-500/20 text-green-300 border border-green-500/30';
		if (status === 'CLEAR') return 'bg-red-500/20 text-red-300 border border-red-500/30';
		return 'bg-zinc-800 text-gray-300 border border-zinc-700';
	};

	const getDemoReportStatusLabel = (status: string) => {
		if (status === 'REVIEW') return 'Pending Review';
		if (status === 'ACTION') return 'Reviewed';
		if (status === 'CLEAR') return 'Rejected';
		return status;
	};
</script>

<div class="container mx-auto px-4 py-8 max-w-7xl">
	<!-- Match Header -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
		<div class="flex items-center justify-between mb-4">
			<h1 class="text-3xl font-bold text-white">
				Match #{match.id}
				{#if data.weekLabel}
					<span class="text-gray-400">- Week {data.weekLabel}</span>
				{:else if match.playoffRound}
					<span class="text-gray-400">- {match.playoffRound > 0 ? `Upper Round ${match.playoffRound}` : `Lower Round ${Math.abs(match.playoffRound)}`}</span>
				{/if}
			</h1>
			<span class="px-4 py-2 rounded-full text-sm font-semibold {getStatusBadge(match.status)}">
				{getStatusLabel(match.status)}
			</span>
		</div>

		<!-- Teams/Players -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
			{#if match.is1v1 && match.homePlayer}
				<!-- 1v1: Home Player -->
				<a href="/users/{match.homePlayer.steamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition">
					<img
						src={match.homePlayer.steamAvatar || '/default-avatar.png'}
						alt={match.homePlayer.steamUsername}
						class="w-16 h-16 rounded-full object-cover"
					/>
					<div>
						<div class="font-semibold text-lg text-white">{match.homePlayer.steamUsername}</div>
						<div class="text-sm text-gray-400">
							{match.homeTeam.division?.name} &bull; {match.homeTeam.region?.name}
						</div>
					</div>
				</a>
			{:else}
				<!-- 2v2: Home Team -->
				<a href="/teams/{match.homeTeamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition">
					<img
						src={match.homeTeam.avatar || '/default-avatar.png'}
						alt={match.homeTeam.name}
						class="w-16 h-16 rounded-full object-cover"
					/>
					<div>
						<div class="font-semibold text-lg text-white">{match.homeTeam.name}</div>
						<div class="text-sm text-gray-400">
							{match.homeTeam.division?.name} &bull; {match.homeTeam.region?.name}
						</div>
					</div>
				</a>
			{/if}

			<!-- Score -->
			<div class="text-center">
				{#if isPlayed || isDisputed}
					<div class="text-4xl font-bold text-white">
						{match.winnerId === match.homeTeamId ? match.winnerScore : match.loserScore}
						<span class="text-gray-400">-</span>
						{match.winnerId === match.awayTeamId ? match.winnerScore : match.loserScore}
					</div>
					<div class="text-sm text-gray-400 mt-2">
						Best of {match.boSeries}
					</div>
				{:else}
					<div class="text-2xl text-gray-400">VS</div>
					<div class="text-sm text-gray-400 mt-2">
						Best of {match.boSeries}
					</div>
				{/if}
			</div>

			{#if match.is1v1 && match.awayPlayer}
				<!-- 1v1: Away Player -->
				<a href="/users/{match.awayPlayer.steamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition justify-end">
					<div class="text-right">
						<div class="font-semibold text-lg text-white">{match.awayPlayer.steamUsername}</div>
						<div class="text-sm text-gray-400">
							{match.awayTeam.division?.name} &bull; {match.awayTeam.region?.name}
						</div>
					</div>
					<img
						src={match.awayPlayer.steamAvatar || '/default-avatar.png'}
						alt={match.awayPlayer.steamUsername}
						class="w-16 h-16 rounded-full object-cover"
					/>
				</a>
			{:else}
				<!-- 2v2: Away Team -->
				<a href="/teams/{match.awayTeamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition justify-end">
					<div class="text-right">
						<div class="font-semibold text-lg text-white">{match.awayTeam.name}</div>
						<div class="text-sm text-gray-400">
							{match.awayTeam.division?.name} &bull; {match.awayTeam.region?.name}
						</div>
					</div>
					<img
						src={match.awayTeam.avatar || '/default-avatar.png'}
						alt={match.awayTeam.name}
						class="w-16 h-16 rounded-full object-cover"
					/>
				</a>
			{/if}
		</div>

		<!-- Match Info Cards -->
		<div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Season Info -->
			<div class="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
						<span class="text-purple-400 text-xl">🏆</span>
					</div>
					<div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
						<p class="text-xs text-gray-400 uppercase tracking-wide leading-none mb-1">Season</p>
						<p class="text-white font-semibold leading-tight">{match.season.region.name} S{match.seasonNo}</p>
					</div>
				</div>
			</div>

			<!-- Date/Time Info -->
			<div class="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
						<span class="text-blue-400 text-xl">📅</span>
					</div>
					<div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
						<p class="text-xs text-gray-400 uppercase tracking-wide leading-none mb-1">Scheduled</p>
						{#if match.matchDateTime && match.matchDateTime !== null}
							<p class="text-white font-semibold leading-tight">
								{new Date(match.matchDateTime).toLocaleString('en-US', {
									month: 'short',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
									timeZone: 'UTC',
									hour12: true
								})}
							</p>
							<p class="text-xs text-gray-500 leading-tight">
								{new Date(match.matchDateTime).toLocaleString('en-US', {
									year: 'numeric',
									timeZone: 'UTC'
								})} (UTC)
							</p>
						{:else}
							<p class="text-gray-400 font-medium leading-tight">To Be Determined</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Submitted By Info (or Not Submitted Warning) -->
			{#if match.submittedBy}
				<div class="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
							<span class="text-green-400 text-xl">✓</span>
						</div>
						<div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
							<p class="text-xs text-gray-400 uppercase tracking-wide leading-none mb-1">Submitted By</p>
						<a 
							href="/users/{match.submittedBy}" 
							class="text-white font-semibold hover:text-blue-400 transition-colors leading-tight"
						>
								{match.submitter?.steamUsername}
							</a>
							{#if match.submittedAt}
								<p class="text-xs text-gray-500 leading-tight">
									{new Date(match.submittedAt).toLocaleString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric',
										hour: '2-digit',
										minute: '2-digit',
										timeZone: 'UTC',
										hour12: true
									})} UTC
								</p>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
							<span class="text-yellow-400 text-xl">⚠️</span>
						</div>
						<div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
							<p class="text-xs text-gray-400 uppercase tracking-wide leading-none mb-1">Submitted By</p>
							<p class="text-yellow-400 font-semibold leading-tight">Awaiting match completion</p>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Arena Cards -->
		{#if matchArenas().length > 0}
			<div class="mt-6">
				<p class="text-xs text-gray-400 uppercase tracking-wide mb-3">Maps</p>
				<div class="flex flex-wrap gap-3">
					{#each matchArenas() as arena}
						<div class="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-3 border border-zinc-700/50">
							{#if arena.avatar}
								<img 
									src={arena.avatar} 
									alt={arena.name}
									class="w-10 h-10 rounded object-cover"
								/>
							{:else}
								<div class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center">
									<span class="text-zinc-500 text-lg">🗺️</span>
								</div>
							{/if}
							<span class="text-white font-medium">{arena.name}</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="mt-6">
				<p class="text-xs text-gray-400 uppercase tracking-wide mb-3">Maps</p>
				<div class="text-gray-500 text-sm">To be determined</div>
			</div>
		{/if}
	</div>

	<!-- Score Submission Form -->
	{#if canSubmitScores}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-2xl font-bold text-white mb-4">Submit Match Scores</h2>
			
			<!-- Error Message -->
			{#if scoreSubmitError}
				<div class="mb-4 p-4 bg-red-900/20 border border-red-700 rounded-lg">
					<p class="text-red-300 font-semibold">Error</p>
					<p class="text-red-200 text-sm">{scoreSubmitError}</p>
				</div>
			{/if}
			
			<!-- Success Message -->
			{#if scoreSubmitSuccess}
				<div class="mb-4 p-4 bg-green-900/20 border border-green-700 rounded-lg">
					<p class="text-green-300 font-semibold">Success!</p>
					<p class="text-green-200 text-sm">Scores submitted successfully</p>
				</div>
			{/if}
			
			<form 
				method="POST" 
				action="?/submitScores" 
				use:enhance={() => {
					isSubmittingScore = true;
					scoreSubmitError = null;
					scoreSubmitSuccess = false;
					
				return async ({ result, update }) => {
					isSubmittingScore = false;
					
					if (result.type === 'failure') {
						const errorData = result.data as { error?: string } | undefined;
						scoreSubmitError = errorData?.error || 'Failed to submit scores';
					} else if (result.type === 'success') {
						scoreSubmitSuccess = true;
						// Clear success message after a delay
						setTimeout(() => {
							scoreSubmitSuccess = false;
						}, 3000);
					}
					
					await update();
				};
				}}
			>
				<div class="space-y-4">
					{#each Array(match.boSeries || 3) as _, i}
						{@const disabled = isGameDisabled(i)}
						{@const decidedAt = matchDecidedAtGame()}
						{@const isMatchDecidedBefore = decidedAt !== null && i > decidedAt}
						<div class="border border-zinc-700 rounded-lg p-4 {disabled ? 'opacity-50' : ''}">
							<div class="flex items-center justify-between mb-3">
								<h3 class="font-semibold text-white">Game {i + 1}</h3>
								{#if disabled}
									<span class="text-xs text-gray-500 bg-zinc-800 px-2 py-1 rounded">
										{isMatchDecidedBefore ? 'Not needed - match already decided' : 'Fill previous games first'}
									</span>
								{/if}
							</div>
							<div class="grid grid-cols-3 gap-4 items-center">
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-1">
										{getHomeName()}
									</label>
									<input
										type="number"
										name="homeScore_{i}"
										min="0"
										required={!disabled}
										disabled={disabled}
										value={gameScores[i]?.home ?? ''}
										oninput={(e) => {
											const val = e.currentTarget.value;
											if (gameScores[i]) {
												gameScores[i].home = val === '' ? null : parseInt(val);
											}
										}}
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-gray-500"
									/>
								</div>
								<div class="text-center text-gray-400 font-semibold">VS</div>
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-1">
										{getAwayName()}
									</label>
									<input
										type="number"
										name="awayScore_{i}"
										min="0"
										required={!disabled}
										disabled={disabled}
										value={gameScores[i]?.away ?? ''}
										oninput={(e) => {
											const val = e.currentTarget.value;
											if (gameScores[i]) {
												gameScores[i].away = val === '' ? null : parseInt(val);
											}
										}}
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-gray-500"
									/>
								</div>
							</div>
							{#if !data.mapBanStatus || data.mapBanStatus.isComplete}
								{@const gameArena = match.games[i]?.arena}
								{@const defaultArenaId = gameArena?.id ?? (matchArenas().length === 1 ? matchArenas()[0].id : null)}
								<div class="mt-3">
									<label class="block text-sm font-medium text-gray-300 mb-1">Arena/Map</label>
									<select
										name="arenaId_{i}"
										disabled={disabled}
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-gray-500"
									>
										{#each matchArenas() as arena}
											<option value={arena.id} selected={defaultArenaId === arena.id}>{arena.name}</option>
										{/each}
									</select>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				
				<!-- Match status indicator -->
				{#if matchDecided()}
					{@const wins = gamesWonByTeam()}
					<div class="mt-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
						<p class="text-green-300 text-sm">
							&#10003; Match decided: <strong>{wins.home >= gamesToWin ? getHomeName() : getAwayName()}</strong> wins {Math.max(wins.home, wins.away)}-{Math.min(wins.home, wins.away)}
						</p>
					</div>
				{/if}
				<div class="mt-6">
					<button
						type="submit"
						disabled={isSubmittingScore}
						class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
					>
						{isSubmittingScore ? 'Submitting...' : 'Submit Scores'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Game Results (if played) -->
	{#if (isPlayed || isDisputed) && match.games.some((g) => g.homeTeamScore !== null)}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-2xl font-bold text-white mb-4">Game Results</h2>
			<div class="overflow-x-auto">
				<table class="min-w-full">
					<thead>
						<tr class="border-b border-zinc-700">
							<th class="text-left py-3 px-4 text-gray-300 font-semibold">Game</th>
							<th class="text-left py-3 px-4 text-gray-300 font-semibold">Arena</th>
							<th class="text-center py-3 px-4 text-gray-300 font-semibold">{getHomeName()}</th>
							<th class="text-center py-3 px-4 text-gray-300 font-semibold">{getAwayName()}</th>
							<th class="text-left py-3 px-4 text-gray-300 font-semibold">Winner</th>
						</tr>
					</thead>
					<tbody>
						{#each match.games as game}
							{#if game.homeTeamScore !== null && game.awayTeamScore !== null}
								<tr class="border-b border-zinc-700 hover:bg-zinc-800">
									<td class="py-3 px-4 font-semibold">Game {game.gameNum}</td>
									<td class="py-3 px-4">{game.arena?.name || 'N/A'}</td>
									<td class="text-center py-3 px-4 {game.homeTeamScore > game.awayTeamScore ? 'font-bold text-green-400' : ''}">
										{game.homeTeamScore}
									</td>
									<td class="text-center py-3 px-4 {game.awayTeamScore > game.homeTeamScore ? 'font-bold text-green-400' : ''}">
										{game.awayTeamScore}
									</td>
									<td class="py-3 px-4">
										{#if game.homeTeamScore > game.awayTeamScore}
											{getHomeName()}
										{:else if game.awayTeamScore > game.homeTeamScore}
											{getAwayName()}
										{:else}
											Tie
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			{#if canDispute && data.disputeTimeRemaining}
				<div class="mt-4 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
					<div class="flex items-center justify-between">
						<div>
							<p class="font-semibold text-yellow-800">Dispute Period</p>
							<p class="text-sm text-yellow-700">
								Time remaining: <span class="font-mono">{data.disputeTimeRemaining}</span>
							</p>
						</div>
						<button
							onclick={() => (showDisputeForm = !showDisputeForm)}
							class="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition"
						>
							File Dispute
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Dispute Form -->
	{#if showDisputeForm}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-2xl font-bold text-white mb-4">File Match Dispute</h2>
			<form method="POST" action="?/dispute" use:enhance>
				<div class="mb-4">
					<label class="block text-sm font-medium text-gray-300 mb-2">Dispute Reason</label>
					<textarea
						name="reason"
						rows="4"
						required
						placeholder="Explain why you are disputing this match..."
						class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					></textarea>
				</div>
				<div class="flex space-x-3">
					<button
						type="submit"
						class="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition font-semibold"
					>
						Submit Dispute
					</button>
					<button
						type="button"
						onclick={() => (showDisputeForm = false)}
						class="bg-gray-300 text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-400 transition font-semibold"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Map Ban/Pick Interface -->
	{#if mapBanActive && data.mapBanStatus}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
			<h2 class="text-2xl font-bold text-white mb-4">Map Ban/Pick Phase</h2>
			
			<div class="mb-6">
				<div class="text-sm text-gray-300 mb-2">
					Current Turn: <span class="font-semibold">
						{data.mapBanStatus.matchMapBan.currentTurn === 0 ? getHomeName() : getAwayName()}
					</span>
				</div>
				<div class="text-sm text-gray-300">
					Next Action: <span class="font-semibold uppercase">{data.mapBanStatus.nextAction}</span>
				</div>
			</div>

			<!-- Available Maps -->
			{#if isUserTurn()}
				<div class="mb-6">
					<h3 class="font-semibold text-white mb-3">Available Maps</h3>
					<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{#each data.mapBanStatus.availableArenas as mapInPool}
							<form method="POST" action="?/mapAction" use:enhance>
								<input type="hidden" name="arenaId" value={mapInPool.arena.id} />
								<input type="hidden" name="actionType" value={data.mapBanStatus.nextAction} />
								<button
									type="submit"
									class="w-full p-4 border-2 border-zinc-700 rounded-lg hover:border-blue-500 hover:bg-blue-900/20 transition"
								>
									<div class="font-semibold">{mapInPool.arena.name}</div>
									<div class="text-xs text-gray-400 mt-1 uppercase">{data.mapBanStatus.nextAction}</div>
								</button>
							</form>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Ban/Pick History -->
			<div class="mt-6">
				<h3 class="font-semibold text-white mb-3">Action History</h3>
				<div class="space-y-2">
					{#each data.mapBanStatus.matchMapBan.actions as action}
						<div class="flex items-center space-x-3 p-3 bg-zinc-800 rounded-lg">
					<span class="px-2 py-1 rounded text-xs font-semibold {action.actionType === 'BAN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
						{action.actionType}
					</span>
					<span class="font-medium">{action.team?.name || 'Unknown'}</span>
					<span class="text-gray-300">{action.actionType === 'BAN' ? 'banned' : 'picked'}</span>
					<span class="font-semibold">{action.arena?.name || 'Unknown'}</span>
				</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Match Communications -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-2xl font-bold text-white mb-4">Match Communications</h2>

		<!-- Pending Reschedule Alert -->
		{#if data.pendingReschedule && data.canReschedule && data.permissions.canManage}
			<div class="mb-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
				<div class="flex items-center justify-between">
					<div>
						<p class="font-semibold text-blue-300">Reschedule Request Pending</p>
						<p class="text-sm text-blue-300">
							Proposed: {data.pendingReschedule.reschedule}
						</p>
						{#if data.rescheduleTimeRemaining}
							<p class="text-xs text-blue-400 mt-1">
								Time to respond: <span class="font-mono">{data.rescheduleTimeRemaining}</span>
							</p>
						{/if}
					</div>
					{#if data.hasPendingReschedule}
						<div class="flex space-x-2">
							<form method="POST" action="?/respondReschedule" use:enhance>
								<input type="hidden" name="commId" value={data.pendingReschedule.id} />
								<input type="hidden" name="response" value="accept" />
								<button
									type="submit"
									class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
								>
									Accept
								</button>
							</form>
							<form method="POST" action="?/respondReschedule" use:enhance>
								<input type="hidden" name="commId" value={data.pendingReschedule.id} />
								<input type="hidden" name="response" value="deny" />
								<button
									type="submit"
									class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm"
								>
									Deny
								</button>
							</form>
						</div>
					{:else if data.user && data.pendingReschedule.owner === data.user.steamId}
						<form method="POST" action="?/respondReschedule" use:enhance>
							<input type="hidden" name="commId" value={data.pendingReschedule.id} />
							<input type="hidden" name="response" value="cancel" />
							<button
								type="submit"
								class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm"
							>
								Cancel Request
							</button>
						</form>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Message Form -->
		{#if data.permissions.canManage}
			<div class="mb-6 p-4 bg-zinc-800 rounded-lg">
				<form 
					method="POST" 
					action="?/postMessage" 
					use:enhance={() => {
						isSubmittingMessage = true;
						return async ({ result, update }) => {
							isSubmittingMessage = false;
							if (result.type === 'success') {
								messageContent = '';
							}
							await update();
						};
					}}
				>
					<div class="mb-3">
						<textarea
							name="content"
							bind:value={messageContent}
							rows="3"
							placeholder="Write your message..."
							disabled={isSubmittingMessage}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
						></textarea>
					</div>
					<div class="flex gap-3">
						<button
							type="submit"
							disabled={messageContent.trim().length === 0 || isSubmittingMessage}
							class="bg-blue-600 text-white px-4 py-2 rounded-lg transition disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-blue-700 disabled:hover:bg-gray-600"
						>
							{isSubmittingMessage ? 'Posting...' : 'Post Message'}
						</button>
						{#if data.canReschedule && !data.pendingReschedule}
							<button
								type="button"
								onclick={() => (showRescheduleForm = !showRescheduleForm)}
								class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
							>
								{showRescheduleForm ? 'Cancel Reschedule' : 'Request Reschedule'}
							</button>
						{/if}
					</div>
				</form>
			</div>

			<!-- Reschedule Form -->
			{#if showRescheduleForm && data.canReschedule && !data.pendingReschedule}
				<div class="mb-6 p-4 bg-zinc-800 rounded-lg">
					<form method="POST" action="?/requestReschedule" use:enhance>
						<div class="mb-3">
							<label class="block text-sm font-medium text-gray-300 mb-1">Proposed Date/Time (UTC)</label>
							<input
								type="datetime-local"
								name="proposedDateTime"
								required
								class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
							<p class="text-xs text-gray-500 mt-1">Enter time in UTC timezone</p>
						</div>
						<button
							type="submit"
							class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
						>
							Send Request
						</button>
					</form>
				</div>
			{/if}
		{/if}

		<!-- Messages -->
		<div class="space-y-3">
			{#each match.matchComms as comm, index}
				<div class="p-4 bg-zinc-800 rounded-lg">
					<div class="flex items-start space-x-3">
						<div class="flex-shrink-0">
							<span class="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-gray-300">
								#{match.matchComms.length - index}
							</span>
						</div>
						<img
							src={comm.user?.steamAvatar || '/default-avatar.png'}
							alt={comm.user?.steamUsername || 'System'}
							class="w-10 h-10 rounded-full"
						/>
						<div class="flex-1">
							<div class="flex items-center space-x-2">
								<a href="/users/{comm.owner}" class="font-semibold text-white hover:text-blue-400">
									{comm.user?.steamUsername || 'System'}
								</a>
								{#if comm.createdAt}
									<span class="text-xs text-gray-400">
										{new Date(comm.createdAt).toLocaleString()}
									</span>
								{:else}
									<span class="text-xs text-gray-500 italic">
										No timestamp
									</span>
								{/if}
							</div>
							<p class="text-gray-300 mt-1 whitespace-pre-wrap">{comm.content}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Demos Section -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-2xl font-bold text-white">Match Demos</h2>
			{#if data.canUploadDemo}
				<button
					onclick={openDemoUploadModal}
					class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-semibold"
				>
					Upload Demo
				</button>
			{/if}
		</div>

		{#if match.demos && match.demos.length > 0}
			<div class="space-y-3">
				{#each match.demos as demo}
					<div class="p-4 bg-zinc-800 rounded-lg">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center space-x-3 mb-2">
									{#if demo.player}
										<img 
											src={demo.player.steamAvatar} 
											alt={demo.player.steamUsername}
											class="w-8 h-8 rounded-full"
										/>
										<div>
											<a href="/users/{demo.playerSteamId}" class="font-semibold text-white hover:text-blue-400">
												{demo.player.steamUsername}
											</a>
											<span class="text-gray-400 text-sm">'s Demo</span>
										</div>
									{:else}
										<div class="font-semibold text-white">Demo File</div>
									{/if}
								</div>
								<div class="text-sm text-gray-300 mb-1">
									Submitted by <a href="/users/{demo.submittedBy}" class="text-blue-400 hover:underline">
										{demo.submitter?.steamUsername}
									</a>
									• {new Date(demo.submittedAt).toLocaleDateString()}
								</div>
								{#if demo.description}
									<p class="text-sm text-gray-300 mt-2">{demo.description}</p>
								{/if}

								{#if data.user && data.userDemoReports[demo.id] && data.userDemoReports[demo.id].length > 0}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each data.userDemoReports[demo.id] as report}
											<span class="px-3 py-1 rounded-full text-xs font-semibold {getDemoReportStatusBadge(report.status)}">
												Your Report: {getDemoReportStatusLabel(report.status)}
											</span>
										{/each}
									</div>
								{/if}
							</div>
							
							<div class="flex items-center space-x-2 ml-4">
								<a
									href={demo.file}
									target="_blank"
									class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm whitespace-nowrap"
								>
									Download
								</a>
								{#if data.user}
									<button
										onclick={() => openDemoReportModal(demo)}
										class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm whitespace-nowrap"
									>
										Report
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-gray-400 text-center py-8">No demos have been uploaded for this match yet.</p>
		{/if}
	</div>
</div>

<!-- Demo Upload Modal -->
{#if showDemoUploadModal}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
		onclick={closeDemoUploadModal}
		onkeydown={(e) => e.key === 'Escape' && closeDemoUploadModal()}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-800 p-6 rounded-lg w-[500px]" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog" 
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex justify-between items-center mb-4">
				<h3 class="text-xl font-bold text-white">Upload Demo</h3>
				<button onclick={closeDemoUploadModal} class="text-gray-400 hover:text-gray-200" aria-label="Close modal">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{#if isUploadingDemo}
				<!-- Upload Progress State -->
				<div class="py-8">
					<div class="flex flex-col items-center justify-center">
						<!-- Animated spinner -->
						<div class="relative w-16 h-16 mb-4">
							<div class="absolute inset-0 border-4 border-zinc-600 rounded-full"></div>
							<div class="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
						</div>
						
						<p class="text-white font-medium mb-2">Uploading Demo...</p>
						<p class="text-gray-400 text-sm mb-4">{demoUploadProgress}</p>
						
						{#if selectedDemoFile}
							<div class="bg-zinc-700/50 rounded-lg px-4 py-2 text-sm">
								<span class="text-gray-300">{selectedDemoFile.name}</span>
								<span class="text-gray-500 ml-2">({formatFileSize(selectedDemoFile.size)})</span>
							</div>
						{/if}
						
						<p class="text-xs text-gray-500 mt-4">Large files may take a few minutes</p>
					</div>
				</div>
			{:else}
				<!-- Upload Form -->
				<form 
					method="POST" 
					action="?/uploadDemo" 
					enctype="multipart/form-data"
					use:enhance={() => {
						isUploadingDemo = true;
						demoUploadError = null;
						demoUploadProgress = 'Uploading file...';
						
						const progressMessages = [
							'Uploading file...',
							'Processing demo...',
							'Saving to storage...',
							'Almost done...'
						];
						let msgIndex = 0;
						const progressInterval = setInterval(() => {
							msgIndex = Math.min(msgIndex + 1, progressMessages.length - 1);
							demoUploadProgress = progressMessages[msgIndex];
						}, 3000);
						
						return async ({ result, update }) => {
							clearInterval(progressInterval);
							isUploadingDemo = false;
							
							if (result.type === 'success') {
								closeDemoUploadModal();
							} else if (result.type === 'failure') {
								const errorData = result.data as { error?: string } | undefined;
								demoUploadError = errorData?.error || 'Upload failed. Please try again.';
							} else if (result.type === 'error') {
								demoUploadError = 'Network error. Please check your connection and try again.';
							}
							
							await update();
						};
					}}
				>
					<div class="mb-4">
						<label for="playerSteamId" class="block text-sm font-medium text-gray-200 mb-2">Player</label>
						<select
							id="playerSteamId"
							name="playerSteamId"
							required
							class="w-full bg-zinc-700 text-gray-200 rounded-md p-2 text-sm border border-zinc-600"
						>
							<option value="">Select a player...</option>
							{#each data.allRoster as player}
								<option value={player.steamId}>{player.username}</option>
							{/each}
						</select>
					</div>

					<div class="mb-4">
						<label for="demoFile" class="block text-sm font-medium text-gray-200 mb-2">Demo File (.dem)</label>
						<input
							type="file"
							id="demoFile"
							name="file"
							accept=".dem"
							required
							onchange={handleDemoFileSelect}
							class="w-full text-sm text-gray-200
								   file:mr-4 file:py-2 file:px-4
								   file:rounded file:border-0
								   file:text-sm file:font-semibold
								   file:bg-zinc-700 file:text-gray-200
								   hover:file:bg-zinc-600
								   cursor-pointer"
						/>
						
						<!-- File info display -->
						{#if selectedDemoFile}
							<div class="mt-2 p-2 bg-zinc-700/50 rounded flex items-center gap-2">
								<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span class="text-gray-200 text-sm">{selectedDemoFile.name}</span>
								<span class="text-gray-400 text-xs">({formatFileSize(selectedDemoFile.size)})</span>
							</div>
						{:else}
							<p class="text-xs text-gray-400 mt-1">Maximum file size: 200MB</p>
						{/if}
					</div>

					<div class="mb-6">
						<label for="demoDescription" class="block text-sm font-medium text-gray-200 mb-2">Description (Optional)</label>
						<textarea
							id="demoDescription"
							name="description"
							rows="3"
							class="w-full bg-zinc-700 text-gray-200 rounded-md p-2 text-sm border border-zinc-600"
							placeholder="Add any notes about this demo..."
						></textarea>
					</div>

					<!-- Error display -->
					{#if demoUploadError}
						<div class="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
							<div class="flex items-start gap-3">
								<svg class="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<div>
									<p class="text-red-300 font-medium text-sm">Upload Failed</p>
									<p class="text-red-200/80 text-sm mt-1">{demoUploadError}</p>
									<p class="text-red-200/60 text-xs mt-2">If this persists, try a smaller file or contact support.</p>
								</div>
							</div>
						</div>
					{/if}

					<div class="flex justify-end space-x-3">
						<button
							type="button"
							onclick={closeDemoUploadModal}
							class="px-4 py-2 bg-zinc-700 text-gray-200 rounded hover:bg-zinc-600"
							disabled={isUploadingDemo}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={!selectedDemoFile || !!demoUploadError}
						>
							Upload Demo
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

<!-- Demo Report Modal -->
{#if showDemoReportModal && selectedDemoForReport}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
		onclick={closeDemoReportModal}
		onkeydown={(e) => e.key === 'Escape' && closeDemoReportModal()}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-800 p-6 rounded-lg w-[500px]" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog" 
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex justify-between items-center mb-4">
				<h3 class="text-xl font-bold text-white">Report Demo</h3>
				<button onclick={closeDemoReportModal} class="text-gray-400 hover:text-gray-200" aria-label="Close modal">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form 
				method="POST" 
				action="?/reportDemo"
				use:enhance={() => {
					isReportingDemo = true;
					return async ({ result, update }) => {
						isReportingDemo = false;
						if (result.type === 'success') {
							closeDemoReportModal();
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="demoId" value={selectedDemoForReport.id} />

				<div class="mb-4">
					<p class="text-gray-200 mb-2">
						Reporting demo for: 
						<span class="font-bold text-white">
							{selectedDemoForReport.player?.steamUsername || 'Unknown Player'}
						</span>
					</p>
					<p class="text-sm text-gray-400">
						Please describe why you believe this demo should be reviewed for suspicious activity.
					</p>
				</div>

				<div class="mb-6">
					<label for="reportDescription" class="block text-sm font-medium text-gray-200 mb-2">Description *</label>
					<textarea
						id="reportDescription"
						name="description"
						rows="4"
						required
						maxlength="1000"
						class="w-full bg-zinc-700 text-gray-200 rounded-md p-2 text-sm border border-zinc-600"
						placeholder="Describe the suspicious behavior (max 1000 characters)..."
					></textarea>
				</div>

				{#if form?.error && !isReportingDemo}
					<div class="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
						{form.error}
					</div>
				{/if}

				{#if form?.success && form?.message}
					<div class="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
						{form.message}
					</div>
				{/if}

				<div class="flex justify-end space-x-3">
					<button
						type="button"
						onclick={closeDemoReportModal}
						class="px-4 py-2 bg-zinc-700 text-gray-200 rounded hover:bg-zinc-600"
						disabled={isReportingDemo}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
						disabled={isReportingDemo}
					>
						{isReportingDemo ? 'Submitting...' : 'Submit Report'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

