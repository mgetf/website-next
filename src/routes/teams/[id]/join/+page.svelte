<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';
import FormInput from '$lib/components/ui/form/FormInput.svelte';
import FormError from '$lib/components/ui/form/FormError.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
	<div class="max-w-md w-full">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
			<!-- Team Header -->
			<div class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-8 text-center border-b border-zinc-800">
				{#if data.team.avatar}
					<img
						src={data.team.avatar}
						alt={data.team.name}
						class="w-20 h-20 rounded-lg mx-auto mb-4 object-cover"
					/>
				{:else}
					<div
						class="w-20 h-20 rounded-lg bg-zinc-800 border border-zinc-700 mx-auto mb-4 flex items-center justify-center"
					>
						<span class="text-3xl text-gray-400">{data.team.name.charAt(0)}</span>
					</div>
				{/if}
				<h1 class="text-2xl font-bold text-white mb-2">{data.team.name}</h1>
				<p class="text-sm text-gray-400">
					{data.team.division?.name || ''} • {data.team.region?.name || ''}
				</p>
			</div>

			<!-- Form -->
			<div class="p-8">
				{#if !data.canJoin}
					<!-- Cannot Join -->
					<div class="text-center">
						<div class="text-5xl mb-4">🔒</div>
						<p class="text-gray-400 mb-6">{data.error}</p>
						<a
							href="/teams/{data.team.id}"
							class="inline-block px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
						>
							View Team Page
						</a>
					</div>
				{:else}
					<div class="text-center mb-6">
						<p class="text-gray-300">
							Enter the team password to request joining this team
						</p>
					</div>

					<!-- Error Message -->
					<FormError error={form?.error} />

					<!-- Join Form -->
					<form
						method="POST"
						action="?/joinTeam"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<FormInput
							label="Team Password"
							name="password"
							type="password"
							required
							placeholder="Enter team password"
						/>

						<button
							type="submit"
							disabled={isSubmitting}
							class="w-full px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
						>
							{isSubmitting ? 'Requesting...' : 'Request to Join'}
						</button>
					</form>

					<p class="text-xs text-gray-500 text-center mt-4">
						Your request will be reviewed by admins
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>


