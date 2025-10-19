<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showScoreForm = $state(false);
	let showDisputeForm = $state(false);
	let showRescheduleForm = $state(false);
	let messageContent = $state('');
	let scoreSubmitError = $state<string | null>(null);
	let scoreSubmitSuccess = $state(false);
	let isSubmittingScore = $state(false);
	let isSubmittingMessage = $state(false);

	const match = $derived(data.match);
	const isUnplayed = $derived(match.status === 'UNPLAYED');
	const isPlayed = $derived(match.status === 'PLAYED');
	const isDisputed = $derived(match.status === 'DISPUTE');
	
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
					<span class="text-gray-400">- Playoff Round {match.playoffRound}</span>
				{/if}
			</h1>
			<span class="px-4 py-2 rounded-full text-sm font-semibold {getStatusBadge(match.status)}">
				{getStatusLabel(match.status)}
			</span>
		</div>

		<!-- Teams -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
			<!-- Home Team -->
			<a href="/teams/{match.homeTeamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition">
				<img
					src={match.homeTeam.avatar || '/default-avatar.png'}
					alt={match.homeTeam.name}
					class="w-16 h-16 rounded-full object-cover"
				/>
				<div>
					<div class="font-semibold text-lg text-white">{match.homeTeam.name}</div>
					<div class="text-sm text-gray-400">
						{match.homeTeam.division?.name} • {match.homeTeam.region?.name}
					</div>
				</div>
			</a>

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

			<!-- Away Team -->
			<a href="/teams/{match.awayTeamId}" class="flex items-center space-x-4 hover:bg-zinc-800 p-4 rounded-lg transition justify-end">
				<div class="text-right">
					<div class="font-semibold text-lg text-white">{match.awayTeam.name}</div>
					<div class="text-sm text-gray-400">
						{match.awayTeam.division?.name} • {match.awayTeam.region?.name}
					</div>
				</div>
				<img
					src={match.awayTeam.avatar || '/default-avatar.png'}
					alt={match.awayTeam.name}
					class="w-16 h-16 rounded-full object-cover"
				/>
			</a>
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
								href="/player/{match.submittedBy}" 
								class="text-white font-semibold hover:text-blue-400 transition-colors leading-tight"
							>
								{match.submitter?.steamUsername}
							</a>
							{#if match.submittedAt}
								<p class="text-xs text-gray-500 leading-tight">
									{new Date(match.submittedAt * 1000).toLocaleString('en-US', {
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
	</div>

	<!-- Action Buttons -->
	{#if canSubmitScores}
		<div class="mb-6">
			<button
				onclick={() => (showScoreForm = !showScoreForm)}
				class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
			>
				{showScoreForm ? 'Cancel' : 'Submit Scores'}
			</button>
		</div>
	{/if}

	<!-- Score Submission Form -->
	{#if showScoreForm}
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
						setTimeout(() => {
							showScoreForm = false;
							scoreSubmitSuccess = false;
						}, 2000);
					}
					
					await update();
				};
				}}
			>
				<div class="space-y-4">
					{#each Array(match.boSeries || 3) as _, i}
						<div class="border border-zinc-700 rounded-lg p-4">
							<h3 class="font-semibold text-white mb-3">Game {i + 1}</h3>
							<div class="grid grid-cols-3 gap-4 items-center">
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-1">
										{match.homeTeam.name}
									</label>
									<input
										type="number"
										name="homeScore_{i}"
										min="0"
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								<div class="text-center text-gray-400 font-semibold">VS</div>
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-1">
										{match.awayTeam.name}
									</label>
									<input
										type="number"
										name="awayScore_{i}"
										min="0"
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
							</div>
							{#if !data.mapBanStatus || data.mapBanStatus.isComplete}
								<div class="mt-3">
									<label class="block text-sm font-medium text-gray-300 mb-1">Arena/Map</label>
									<select
										name="arenaId_{i}"
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									>
										<option value="">Select arena...</option>
										{#each match.games as game}
											{#if game.arena}
												<option value={game.arena.id}>{game.arena.name}</option>
											{/if}
										{/each}
									</select>
								</div>
							{/if}
						</div>
					{/each}
				</div>
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
							<th class="text-center py-3 px-4 text-gray-300 font-semibold">{match.homeTeam.name}</th>
							<th class="text-center py-3 px-4 text-gray-300 font-semibold">{match.awayTeam.name}</th>
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
											{match.homeTeam.name}
										{:else if game.awayTeamScore > game.homeTeamScore}
											{match.awayTeam.name}
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
						{data.mapBanStatus.matchMapBan.currentTurn === 0 ? match.homeTeam.name : match.awayTeam.name}
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
								<a href="/player/{comm.owner}" class="font-semibold text-white hover:text-blue-400">
									{comm.user?.steamUsername || 'System'}
								</a>
								{#if comm.createdAt && comm.createdAt > 0}
									<span class="text-xs text-gray-400">
										{new Date(comm.createdAt * 1000).toLocaleString()}
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
	<!-- TODO: Demo upload form - needs file upload UI (F10) -->
	{#if match.demos && match.demos.length > 0}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6">
			<h2 class="text-2xl font-bold text-white mb-4">Match Demos</h2>
			<div class="space-y-3">
				{#each match.demos as demo}
					<div class="p-4 bg-zinc-800 rounded-lg flex items-center justify-between">
						<div>
							<div class="font-semibold">{demo.title || 'Demo File'}</div>
							<div class="text-sm text-gray-300">
								Submitted by <a href="/player/{demo.submittedBy}" class="text-blue-400 hover:underline">
									{demo.submitter?.steamUsername}
								</a>
								• {new Date(demo.submittedAt).toLocaleDateString()}
							</div>
							{#if demo.description}
								<p class="text-sm text-gray-300 mt-1">{demo.description}</p>
							{/if}
						</div>
						<a
							href={demo.file}
							download
							class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm"
						>
							Download
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

