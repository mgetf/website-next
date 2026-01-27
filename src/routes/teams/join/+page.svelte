<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
	<div class="max-w-2xl w-full">
		{#if data.error || !data.team}
			<!-- Error State -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">❌</div>
				<h2 class="text-2xl font-bold text-white mb-4">Invalid Invitation</h2>
				<p class="text-gray-400 text-lg mb-6">
					{data.error || 'This invitation link is invalid or has expired.'}
				</p>
				<a
					href="/"
					class="inline-block px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					Go Home
				</a>
			</div>
		{:else if data.rosterLocked}
			<!-- Rosters Locked -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🔒</div>
				<h2 class="text-2xl font-bold text-white mb-4">Rosters Locked</h2>
				<p class="text-gray-400 text-lg mb-6">
					Team rosters are currently locked. You cannot join teams at this time.
				</p>
				<a
					href="/"
					class="inline-block px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					Go Home
				</a>
			</div>
		{:else if !data.canJoin}
			<!-- Cannot Join -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">⚠️</div>
				<h2 class="text-2xl font-bold text-white mb-4">Cannot Join Team</h2>
				<p class="text-gray-400 text-lg mb-6">
					{data.error || 'You cannot join this team at this time.'}
				</p>
				{#if data.team}
					<a
						href="/teams/{data.team.id}"
						class="inline-block px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
					>
						View Team Page
					</a>
				{:else}
					<a
						href="/"
						class="inline-block px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
					>
						Go Home
					</a>
				{/if}
			</div>
		{:else}
			<!-- Join Invitation -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<!-- Team Header -->
				<div class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-8 text-center border-b border-zinc-800">
					{#if data.team.avatar}
						<img
							src={data.team.avatar}
							alt={data.team.name}
							class="w-24 h-24 rounded-lg mx-auto mb-4 object-cover"
						/>
					{:else}
						<div
							class="w-24 h-24 rounded-lg bg-zinc-800 border border-zinc-700 mx-auto mb-4 flex items-center justify-center"
						>
							<span class="text-4xl text-gray-400">{data.team.name.charAt(0)}</span>
						</div>
					{/if}
					<h1 class="text-3xl font-bold text-white mb-2">{data.team.name}</h1>
					<p class="text-gray-400">You've been invited to join this team</p>
				</div>

				<!-- Team Info -->
				<div class="p-8">
					<div class="grid grid-cols-2 gap-4 mb-8">
						<div class="bg-zinc-800 rounded-lg p-4 text-center">
							<div class="text-sm text-gray-400 mb-1">Division</div>
							<div class="font-semibold text-white">{data.team.division?.name || 'N/A'}</div>
						</div>
						<div class="bg-zinc-800 rounded-lg p-4 text-center">
							<div class="text-sm text-gray-400 mb-1">Region</div>
							<div class="font-semibold text-white">{data.team.region?.name || 'N/A'}</div>
						</div>
						<div class="bg-zinc-800 rounded-lg p-4 text-center">
							<div class="text-sm text-gray-400 mb-1">Season</div>
							<div class="font-semibold text-white">
								{data.team.season ? `Season ${data.team.season.seasonNum}` : 'N/A'}
							</div>
						</div>
						<div class="bg-zinc-800 rounded-lg p-4 text-center">
							<div class="text-sm text-gray-400 mb-1">Roster</div>
							<div class="font-semibold text-white">{data.activePlayers.length}/3 Players</div>
						</div>
					</div>

					<!-- Current Roster -->
					{#if data.activePlayers.length > 0}
						<div class="mb-8">
							<h3 class="text-lg font-semibold text-white mb-3">Current Roster</h3>
							<div class="space-y-2">
								{#each data.activePlayers as player}
									<div class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
										<img
											src={player.player.steamAvatar}
											alt={player.player.steamUsername}
											class="w-10 h-10 rounded-full"
										/>
										<div>
											<div class="font-medium text-white">{player.player.steamUsername}</div>
											<div class="text-xs text-gray-400">
												{player.permissionLevel === 2
													? 'Owner'
													: player.permissionLevel === 1
														? 'Admin'
														: 'Member'}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Error Message -->
					{#if form?.error}
						<div class="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
							<p class="text-red-400">{form.error}</p>
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex gap-3">
						<form
							method="POST"
							action="?/accept"
							class="flex-1"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<input type="hidden" name="token" value={data.token} />
							<button
								type="submit"
								disabled={isSubmitting}
								class="w-full px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
							>
								{isSubmitting ? 'Joining...' : 'Accept Invitation'}
							</button>
						</form>
						<form
							method="POST"
							action="?/decline"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<input type="hidden" name="token" value={data.token} />
							<button
								type="submit"
								disabled={isSubmitting}
								class="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:cursor-not-allowed text-gray-300 rounded-lg font-medium transition-colors"
							>
								Decline
							</button>
						</form>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>


