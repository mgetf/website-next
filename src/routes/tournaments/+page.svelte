<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	let activeTab = $state<'cups' | 'championships' | 'fightnights'>('cups');
	let showCreateForm = $state(false);
	let expandedTournament = $state<number | null>(null);
	let isSubmitting = $state(false);
	
	const formatDate = (date: Date | string | null) => {
		if (!date) return 'TBD';
		try {
			const d = new Date(date);
			if (isNaN(d.getTime())) return 'TBD';
			return d.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return 'TBD';
		}
	};
	
	const getStatusBadge = (status: string) => {
		if (status === 'REGISTRATION') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
		if (status === 'IN_PROGRESS') return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
		if (status === 'COMPLETED') return 'bg-green-500/20 text-green-300 border border-green-500/30';
		return 'bg-zinc-800 text-gray-300 border border-zinc-700';
	};
	
	const getStatusLabel = (status: string) => {
		if (status === 'REGISTRATION') return 'Registration';
		if (status === 'IN_PROGRESS') return 'In Progress';
		if (status === 'COMPLETED') return 'Completed';
		return 'Unknown';
	};
	
	const toggleExpanded = (id: number) => {
		expandedTournament = expandedTournament === id ? null : id;
	};
</script>

<svelte:head>
	<title>Tournaments - MGE.tf</title>
	<meta name="description" content="Browse all MGE.tf tournaments including Cups, World Championships, and Fight Night events" />
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-7xl">
	<!-- Page Header -->
	<div class="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="text-4xl font-bold text-white mb-2">Tournaments</h1>
			<p class="text-gray-400 text-lg">Browse all historic MGE.tf tournaments and competitive events</p>
		</div>
		
		{#if data.isGlobalAdmin}
			<button
				onclick={() => showCreateForm = !showCreateForm}
				class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 self-start"
			>
				{#if showCreateForm}
					<span>✕</span> Cancel
				{:else}
					<span>+</span> Create Tournament
				{/if}
			</button>
		{/if}
	</div>
	
	<!-- Form Messages -->
	{#if form?.error}
		<div class="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300">
			{form.message}
		</div>
	{/if}
	
	<!-- Admin Create Form -->
	{#if data.isGlobalAdmin && showCreateForm}
		<div class="mb-8 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h2 class="text-xl font-bold text-white mb-4">Create New Tournament</h2>
			<form 
				method="POST" 
				action="?/create"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						showCreateForm = false;
					};
				}}
				class="space-y-4"
			>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="name" class="block text-sm font-medium text-gray-300 mb-1">
							Tournament Name <span class="text-red-400">*</span>
						</label>
						<input 
							type="text" 
							name="name" 
							id="name" 
							required
							placeholder="e.g. Summer Cup 2025"
							class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						/>
					</div>
					<div>
						<label for="startedAt" class="block text-sm font-medium text-gray-300 mb-1">
							Tournament Date
						</label>
						<input 
							type="date" 
							name="startedAt" 
							id="startedAt"
							class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						/>
					</div>
				</div>
				
				<div>
					<label for="description" class="block text-sm font-medium text-gray-300 mb-1">
						Description
					</label>
					<textarea 
						name="description" 
						id="description"
						rows="2"
						placeholder="Brief description of the tournament"
						class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					></textarea>
				</div>
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="bracketLink" class="block text-sm font-medium text-gray-300 mb-1">
							Bracket URL
						</label>
						<input 
							type="url" 
							name="bracketLink" 
							id="bracketLink"
							placeholder="https://challonge.com/..."
							class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						/>
					</div>
					<div>
						<label for="avatar" class="block text-sm font-medium text-gray-300 mb-1">
							Avatar URL
						</label>
						<input 
							type="url" 
							name="avatar" 
							id="avatar"
							placeholder="https://..."
							class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
						/>
					</div>
				</div>
				
				<div class="flex items-center gap-2">
					<input 
						type="checkbox" 
						name="isTeamTournament" 
						id="isTeamTournament"
						class="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
					/>
					<label for="isTeamTournament" class="text-sm text-gray-300">
						Team Tournament (2v2)
					</label>
				</div>
				
				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => showCreateForm = false}
						class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
					>
						{isSubmitting ? 'Creating...' : 'Create Tournament'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Tab Navigation -->
	<div class="border-b border-zinc-800 mb-8">
		<nav class="flex space-x-8">
			<button
				onclick={() => activeTab = 'cups'}
				class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'cups' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}"
			>
				Cups
				<span class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'cups' ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-gray-400'}">
					{data.tournaments.length}
				</span>
			</button>
			
			<button
				onclick={() => activeTab = 'championships'}
				class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'championships' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}"
			>
				World Championships
				<span class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'championships' ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-gray-400'}">
					{data.championships.length}
				</span>
			</button>
			
			<button
				onclick={() => activeTab = 'fightnights'}
				class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'fightnights' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}"
			>
				Fight Nights
				<span class="ml-2 py-0.5 px-2 rounded-full text-xs {activeTab === 'fightnights' ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-gray-400'}">
					{data.fightNights.length}
				</span>
			</button>
		</nav>
	</div>

	<!-- Cups Tab -->
	{#if activeTab === 'cups'}
		{#if data.tournaments.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🏆</div>
				<h3 class="text-xl font-bold text-white mb-2">No Tournaments Yet</h3>
				<p class="text-gray-400">Check back later for upcoming tournament cups</p>
			</div>
		{:else}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-zinc-800">
						<thead class="bg-zinc-800/50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Tournament
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Date
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Format
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Winner
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Bracket
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800">
							{#each data.tournaments as tournament}
								<tr class="hover:bg-zinc-800/30 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center space-x-3">
											{#if tournament.avatar}
												<img 
													src={tournament.avatar} 
													alt={tournament.name}
													class="w-12 h-12 rounded object-cover"
												/>
											{:else}
												<div class="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center text-2xl">
													🏆
												</div>
											{/if}
											<div class="flex-1">
												<div class="text-sm font-semibold text-white">
													{tournament.name}
												</div>
												{#if tournament.description}
													<div class="text-xs text-gray-500 line-clamp-1 max-w-xs">
														{tournament.description}
													</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-300">
											{formatDate(tournament.startedAt)}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if tournament.isTeamTournament}
											<span class="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-semibold border border-purple-500/30">
												2v2
											</span>
										{:else}
											<span class="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold border border-blue-500/30">
												1v1
											</span>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if tournament.isTeamTournament}
											{#if tournament.winner1 && tournament.winner2}
												<div class="flex items-center space-x-2">
													<span class="text-yellow-400 text-lg">🥇</span>
													<div class="flex items-center -space-x-2">
														<a href="/users/{tournament.winner1.steamId}" class="relative">
															<img 
																src={tournament.winner1.steamAvatar || '/default-avatar.png'} 
																alt={tournament.winner1.steamUsername}
																class="w-8 h-8 rounded-full ring-2 ring-zinc-900 hover:ring-blue-500 transition-all"
																title={tournament.winner1.steamUsername}
															/>
														</a>
														<a href="/users/{tournament.winner2.steamId}" class="relative">
															<img 
																src={tournament.winner2.steamAvatar || '/default-avatar.png'} 
																alt={tournament.winner2.steamUsername}
																class="w-8 h-8 rounded-full ring-2 ring-zinc-900 hover:ring-blue-500 transition-all"
																title={tournament.winner2.steamUsername}
															/>
														</a>
													</div>
												</div>
											{:else}
												<span class="text-sm text-gray-500">—</span>
											{/if}
										{:else}
											{#if tournament.winner1}
												<div class="flex items-center space-x-2">
													<span class="text-yellow-400 text-lg">🥇</span>
													<a href="/users/{tournament.winner1.steamId}" class="flex items-center space-x-2 group/winner">
														<img 
															src={tournament.winner1.steamAvatar || '/default-avatar.png'} 
															alt={tournament.winner1.steamUsername}
															class="w-8 h-8 rounded-full"
														/>
														<span class="text-sm text-white font-semibold group-hover/winner:text-blue-400 transition-colors">
															{tournament.winner1.steamUsername}
														</span>
													</a>
												</div>
											{:else}
												<span class="text-sm text-gray-500">—</span>
											{/if}
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center gap-3">
											{#if tournament.bracketLink}
												<a 
													href={tournament.bracketLink}
													target="_blank"
													rel="noopener noreferrer"
													class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
												>
													View Bracket →
												</a>
											{:else}
												<span class="text-sm text-gray-500">—</span>
											{/if}
											
											{#if data.isGlobalAdmin}
												<button
													onclick={() => toggleExpanded(tournament.id)}
													class="p-1 text-gray-500 hover:text-white transition-colors"
													title="Manage tournament"
												>
													<svg class="w-5 h-5 transition-transform {expandedTournament === tournament.id ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
													</svg>
												</button>
											{/if}
										</div>
									</td>
								</tr>
								
								<!-- Admin Expanded Row -->
								{#if data.isGlobalAdmin && expandedTournament === tournament.id}
									<tr class="bg-zinc-800/50">
										<td colspan="5" class="px-6 py-4">
											<div class="space-y-4">
												<!-- Set Winners Form -->
												<form 
													method="POST" 
													action="?/setWinners"
													use:enhance={() => {
														isSubmitting = true;
														return async ({ update }) => {
															await update();
															isSubmitting = false;
														};
													}}
													class="space-y-3"
												>
													<input type="hidden" name="tournamentId" value={tournament.id} />
													<h4 class="text-sm font-semibold text-white">Set Winners</h4>
													
													<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
														<!-- 1st Place -->
														<div class="space-y-2">
															<span class="text-xs text-yellow-400 font-medium">🥇 1st Place</span>
															<input 
																type="text" 
																name="winner1SteamId" 
																placeholder="Steam ID"
																value={tournament.winner1SteamId || ''}
																class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
															/>
															{#if tournament.isTeamTournament}
																<input 
																	type="text" 
																	name="winner2SteamId" 
																	placeholder="Partner Steam ID"
																	value={tournament.winner2SteamId || ''}
																	class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
																/>
															{/if}
														</div>
														
														<!-- 2nd Place -->
														<div class="space-y-2">
															<span class="text-xs text-gray-400 font-medium">🥈 2nd Place</span>
															<input 
																type="text" 
																name="secondPlace1SteamId" 
																placeholder="Steam ID"
																value={tournament.secondPlace1SteamId || ''}
																class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
															/>
															{#if tournament.isTeamTournament}
																<input 
																	type="text" 
																	name="secondPlace2SteamId" 
																	placeholder="Partner Steam ID"
																	value={tournament.secondPlace2SteamId || ''}
																	class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
																/>
															{/if}
														</div>
														
														<!-- 3rd Place -->
														<div class="space-y-2">
															<span class="text-xs text-orange-400 font-medium">🥉 3rd Place</span>
															<input 
																type="text" 
																name="thirdPlace1SteamId" 
																placeholder="Steam ID"
																value={tournament.thirdPlace1SteamId || ''}
																class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
															/>
															{#if tournament.isTeamTournament}
																<input 
																	type="text" 
																	name="thirdPlace2SteamId" 
																	placeholder="Partner Steam ID"
																	value={tournament.thirdPlace2SteamId || ''}
																	class="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
																/>
															{/if}
														</div>
													</div>
													
													<button
														type="submit"
														disabled={isSubmitting}
														class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
													>
														{isSubmitting ? 'Saving...' : 'Save Winners'}
													</button>
												</form>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}

	<!-- World Championships Tab -->
	{#if activeTab === 'championships'}
		{#if data.championships.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🌍</div>
				<h3 class="text-xl font-bold text-white mb-2">No Championships Yet</h3>
				<p class="text-gray-400">The World Championship is our premier annual event</p>
			</div>
		{:else}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-zinc-800">
						<thead class="bg-zinc-800/50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Championship
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Date
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Status
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Participants
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Champion
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800">
							{#each data.championships as championship}
								<tr class="hover:bg-zinc-800/30 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center space-x-3">
											{#if championship.avatar}
												<img 
													src={championship.avatar} 
													alt={championship.name}
													class="w-12 h-12 rounded object-cover"
												/>
											{:else}
												<div class="w-12 h-12 rounded bg-gradient-to-br from-purple-900/30 to-zinc-800 flex items-center justify-center text-2xl">
													🌍
												</div>
											{/if}
											<div>
												<div class="text-sm font-semibold text-white">
													{championship.name}
												</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-300">
											{formatDate(championship.startedAt)}
										</div>
										{#if championship.endedAt}
											<div class="text-xs text-gray-500">
												Ended: {formatDate(championship.endedAt)}
											</div>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="px-2 py-1 rounded text-xs font-semibold {getStatusBadge(championship.status)}">
											{getStatusLabel(championship.status)}
										</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-300">
											{championship._count?.participants || 0} Players
										</div>
										{#if championship._count?.matches}
											<div class="text-xs text-gray-500">
												{championship._count.matches} Matches
											</div>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if championship.winnerUser}
											<a href="/users/{championship.winnerUser.steamId}" class="flex items-center space-x-2 group/winner">
												<img 
													src={championship.winnerUser.steamAvatar || '/default-avatar.png'} 
													alt={championship.winnerUser.steamUsername}
													class="w-8 h-8 rounded-full"
												/>
												<span class="text-sm text-white font-semibold group-hover/winner:text-blue-400 transition-colors">
													{championship.winnerUser.steamUsername}
												</span>
												<span class="text-yellow-400 text-lg">👑</span>
											</a>
										{:else if championship.status === 'REGISTRATION'}
											<span class="text-sm text-blue-400">Open</span>
										{:else}
											<span class="text-sm text-gray-500">TBD</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Fight Nights Tab -->
	{#if activeTab === 'fightnights'}
		{#if data.fightNights.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🥊</div>
				<h3 class="text-xl font-bold text-white mb-2">No Fight Nights Yet</h3>
				<p class="text-gray-400">Fight Night events feature exciting matchups and special formats</p>
			</div>
		{:else}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-zinc-800">
						<thead class="bg-zinc-800/50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Event
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Date
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Matchups
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Prize Pool
								</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
									Participants
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800">
							{#each data.fightNights as fightNight}
								<tr class="hover:bg-zinc-800/30 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center space-x-3">
											<div class="w-12 h-12 rounded bg-gradient-to-br from-red-900/30 to-zinc-800 flex items-center justify-center text-2xl flex-shrink-0">
												🥊
											</div>
											<div>
												<div class="text-sm font-semibold text-white">
													{fightNight.card || `Fight Night #${fightNight.id}`}
												</div>
												{#if fightNight.description}
													<div class="text-xs text-gray-500 line-clamp-1 max-w-xs">
														{fightNight.description}
													</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-300">
											{formatDate(fightNight.startedAt)}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-300">
											{fightNight.matchups?.length || 0} {(fightNight.matchups?.length || 0) === 1 ? 'Fight' : 'Fights'}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if fightNight.prizepool > 0}
											<span class="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs font-semibold border border-green-500/30">
												${fightNight.prizepool}
											</span>
										{:else}
											<span class="text-sm text-gray-500">—</span>
										{/if}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										{#if fightNight.matchups && fightNight.matchups.length > 0}
											<div class="flex -space-x-2">
												{#each fightNight.matchups.slice(0, 6) as matchup}
													{#if matchup.player1}
														<img 
															src={matchup.player1.steamAvatar || '/default-avatar.png'} 
															alt={matchup.player1.steamUsername}
															class="w-8 h-8 rounded-full ring-2 ring-zinc-900"
															title={matchup.player1.steamUsername}
														/>
													{/if}
												{/each}
												{#if fightNight.matchups.length > 6}
													<div class="w-8 h-8 rounded-full bg-zinc-800 ring-2 ring-zinc-900 flex items-center justify-center">
														<span class="text-xs text-gray-400">+{fightNight.matchups.length - 6}</span>
													</div>
												{/if}
											</div>
										{:else}
											<span class="text-sm text-gray-500">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</div>

