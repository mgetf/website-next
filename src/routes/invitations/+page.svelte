<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
	<div class="max-w-4xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-4xl font-bold text-white mb-2">Team Invitations</h1>
			<p class="text-gray-400">
				View and manage your pending team invitations
			</p>
		</div>

		<!-- Status Messages -->
		{#if data.rosterLocked}
			<div class="mb-6 p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
				<p class="text-yellow-400">
					🔒 Rosters are currently locked. You cannot accept invitations at this time.
				</p>
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
				<p class="text-green-400">{form.message}</p>
			</div>
		{/if}

		{#if form?.error}
			<div class="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
				<p class="text-red-400">{form.error}</p>
			</div>
		{/if}

		<!-- Invitations List -->
		{#if data.invitations.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">📭</div>
				<h2 class="text-2xl font-bold text-white mb-4">No Pending Invitations</h2>
				<p class="text-gray-400 text-lg">
					You don't have any pending team invitations at this time.
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each data.invitations as invitation}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
						<div class="p-6 flex items-center justify-between">
							<!-- Team Info -->
							<div class="flex items-center gap-4 flex-1">
								{#if invitation.team.avatar}
									<img
										src={invitation.team.avatar}
										alt={invitation.team.name}
										class="w-16 h-16 rounded-lg object-cover"
									/>
								{:else}
									<div
										class="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
									>
										<span class="text-2xl text-gray-400">
											{invitation.team.name.charAt(0)}
										</span>
									</div>
								{/if}

								<div class="flex-1">
									<h3 class="text-xl font-bold text-white mb-1">
										{invitation.team.name}
									</h3>
									<div class="flex flex-wrap gap-2 text-sm text-gray-400">
										{#if invitation.team.division}
											<span class="px-2 py-1 bg-zinc-800 rounded">
												{invitation.team.division.name}
											</span>
										{/if}
										{#if invitation.team.region}
											<span class="px-2 py-1 bg-zinc-800 rounded">
												{invitation.team.region.name}
											</span>
										{/if}
										{#if invitation.team.season}
											<span class="px-2 py-1 bg-zinc-800 rounded">
												Season {invitation.team.season.seasonNum}
											</span>
										{/if}
										<span class="px-2 py-1 bg-zinc-800 rounded">
											{invitation.team.players.length}/3 Players
										</span>
									</div>
								</div>
							</div>

							<!-- Actions -->
							<div class="flex gap-2">
								<form
									method="POST"
									action="?/accept"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
										};
									}}
								>
									<input type="hidden" name="token" value={invitation.token} />
									<button
										type="submit"
										disabled={isSubmitting || data.rosterLocked}
										class="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
									>
										Accept
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
									<input type="hidden" name="teamId" value={invitation.teamId} />
									<button
										type="submit"
										disabled={isSubmitting}
										class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:cursor-not-allowed text-gray-300 rounded-lg font-medium transition-colors"
									>
										Decline
									</button>
								</form>
							</div>
						</div>

						<!-- View Team Link -->
						<div class="px-6 pb-4">
							<a
								href="/teams/{invitation.teamId}"
								class="text-sm text-orange-500 hover:text-orange-400 transition-colors"
							>
								View Team Page →
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>


