<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';
import FormError from '$lib/components/ui/form/FormError.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let activeTab: 'info' | 'roster' | 'pending' | 'invite' = $state('info');
let isSubmitting = $state(false);
let showDisbandConfirm = $state(false);
let avatarPreview: string | null = $state(data.team.avatar);
let showCopyToast = $state(false);

// Force refresh avatar preview when team changes
$effect(() => {
  avatarPreview = data.team.avatar;
  showDisbandConfirm = false;
});

// Helper to get role name
function getRoleName(level: number): string {
  if (level === 2) return 'Owner';
  if (level === 1) return 'Admin';
  return 'Member';
}

// Helper to get active players
let activePlayers = $derived(data.players.filter((p) => p.active === 1));

function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

async function copyInviteLink() {
  const fullUrl = `${window.location.origin}${data.inviteUrl}`;
  await navigator.clipboard.writeText(fullUrl);

  // Show toast notification
  showCopyToast = true;
  setTimeout(() => {
    showCopyToast = false;
  }, 3000);
}
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
	<!-- Copy Toast Notification -->
	{#if showCopyToast}
		<div class="fixed top-4 right-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg shadow-lg z-50 animate-slide-in">
			<p class="text-green-400">✓ Invite link copied to clipboard!</p>
		</div>
	{/if}

	<div class="max-w-5xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<a
				href="/teams/{data.team.id}"
				class="inline-flex items-center text-gray-400 hover:text-white mb-4 transition-colors"
			>
				← Back to Team Page
			</a>
			<div class="flex items-center gap-4 mb-2">
				{#if avatarPreview}
					<img
						src={avatarPreview}
						alt={data.team.name}
						class="w-16 h-16 rounded-lg object-cover"
					/>
				{:else}
					<div
						class="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700"
					>
						<span class="text-2xl text-gray-400">{data.team.name.charAt(0)}</span>
					</div>
				{/if}
				<div>
					<h1 class="text-4xl font-bold text-white">Edit {data.team.name}</h1>
					<p class="text-gray-400">Manage your team settings and roster</p>
				</div>
			</div>
			{#if data.rosterLocked}
				<div class="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
					<p class="text-yellow-400 text-sm">
						🔒 <strong>Rosters are locked.</strong> 
						{#if data.isGlobalAdmin}
							You can bypass this restriction as an admin.
						{:else}
							Some team changes are currently disabled.
						{/if}
					</p>
				</div>
			{/if}
			
			{#if data.isGlobalAdmin && !data.isOwner}
				<div class="mt-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
					<p class="text-blue-400 text-sm">
						👑 <strong>Admin Mode:</strong> You have full access to manage this team as a global administrator.
					</p>
				</div>
			{/if}
		</div>

		<!-- Success/Error Messages -->
		<FormError success={form?.success ? form.message : null} />
		<FormError error={form?.error} />

		<!-- Tabs -->
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg">
			<!-- Tab Headers -->
			<div class="border-b border-zinc-800 p-1 flex gap-1">
				<button
					onclick={() => (activeTab = 'info')}
					class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'info'
						? 'bg-orange-600 text-white font-medium'
						: 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
				>
					Team Info
				</button>
				<button
					onclick={() => (activeTab = 'roster')}
					class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'roster'
						? 'bg-orange-600 text-white font-medium'
						: 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
				>
					Roster ({activePlayers.length}/3)
				</button>
				<button
					onclick={() => (activeTab = 'pending')}
					class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'pending'
						? 'bg-orange-600 text-white font-medium'
						: 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
				>
					Pending {#if data.pendingPlayers.length > 0}({data.pendingPlayers.length}){/if}
				</button>
				<button
					onclick={() => (activeTab = 'invite')}
					class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'invite'
						? 'bg-orange-600 text-white font-medium'
						: 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
				>
					Invite Players
				</button>
			</div>

			<!-- Tab Content -->
			<div class="p-6">
				{#if activeTab === 'info'}
					<!-- Team Info Tab -->
					<div class="space-y-6">
						<!-- Update Name/Acronym -->
						<form
							method="POST"
							action="?/updateInfo"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<h3 class="text-xl font-bold text-white mb-4">Team Information</h3>
							<div class="space-y-4">
								<div>
									<label for="name" class="block text-sm font-medium text-gray-300 mb-2">
										Team Name
									</label>
									<input
										type="text"
										id="name"
										name="name"
										value={data.team.name}
										maxlength="25"
										disabled={data.rosterLocked}
										class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-orange-500"
									/>
								</div>
								<div>
									<label for="acronym" class="block text-sm font-medium text-gray-300 mb-2">
										Team Acronym
									</label>
									<input
										type="text"
										id="acronym"
										name="acronym"
										value={data.team.acronym || ''}
										maxlength="4"
										disabled={data.rosterLocked}
										class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-orange-500"
									/>
								</div>
								<button
									type="submit"
									disabled={isSubmitting || data.rosterLocked}
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
								>
									{isSubmitting ? 'Saving...' : 'Save Changes'}
								</button>
							</div>
						</form>

						<hr class="border-zinc-800" />

						<!-- Update Avatar -->
						<form
							method="POST"
							action="?/updateAvatar"
							enctype="multipart/form-data"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<h3 class="text-xl font-bold text-white mb-4">Team Avatar</h3>
							<div class="flex items-center gap-4">
								{#if avatarPreview}
									<img
										src={avatarPreview}
										alt="Avatar"
										class="w-24 h-24 rounded-lg object-cover border border-zinc-700"
									/>
								{:else}
									<div
										class="w-24 h-24 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
									>
										<span class="text-3xl text-gray-500">?</span>
									</div>
								{/if}
								<div class="flex-1">
									<input
										type="file"
										name="avatar"
										accept="image/*"
										disabled={data.rosterLocked}
										onchange={handleAvatarChange}
										class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-zinc-800 file:text-gray-300 hover:file:bg-zinc-700 disabled:opacity-50"
									/>
									<button
										type="submit"
										disabled={isSubmitting || data.rosterLocked}
										class="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
									>
										{isSubmitting ? 'Uploading...' : 'Upload Avatar'}
									</button>
								</div>
							</div>
						</form>

						<hr class="border-zinc-800" />

						<!-- Update Password -->
						<form
							method="POST"
							action="?/updatePassword"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									await update();
									isSubmitting = false;
								};
							}}
						>
							<h3 class="text-xl font-bold text-white mb-4">Join Password</h3>
							<div class="space-y-4">
								<input
									type="text"
									name="joinPassword"
									value={data.team.joinPassword || ''}
									disabled={data.rosterLocked}
									placeholder="Team join password"
									class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-orange-500"
								/>
								<button
									type="submit"
									disabled={isSubmitting || data.rosterLocked}
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
								>
									{isSubmitting ? 'Saving...' : 'Update Password'}
								</button>
							</div>
						</form>

						{#if data.isOwner || data.isGlobalAdmin}
							<hr class="border-zinc-800" />

							<!-- Disband Team -->
							<div>
								<h3 class="text-xl font-bold text-white mb-4">Danger Zone</h3>
								{#if !showDisbandConfirm}
									<button
										onclick={() => (showDisbandConfirm = true)}
										class="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
									>
										Disband Team
									</button>
									{#if data.isGlobalAdmin && !data.isOwner}
										<p class="text-xs text-gray-500 mt-2">Admin privilege: You can disband any team</p>
									{/if}
								{:else}
									<div class="p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
										<p class="text-red-400 mb-4">
											Are you sure? This action cannot be undone. The team will be marked as disbanded.
											{#if data.isGlobalAdmin && !data.isOwner}
												<br /><strong>Admin action:</strong> This team does not belong to you.
											{/if}
										</p>
										<div class="flex gap-3">
											<form method="POST" action="?/disbandTeam" use:enhance>
												<button
													type="submit"
													class="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
												>
													Yes, Disband Team
												</button>
											</form>
											<button
												onclick={() => (showDisbandConfirm = false)}
												class="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg transition-colors"
											>
												Cancel
											</button>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else if activeTab === 'roster'}
					<!-- Roster Tab -->
					<div>
						<h3 class="text-xl font-bold text-white mb-4">Current Roster</h3>
						{#if activePlayers.length === 0}
							<p class="text-gray-400 text-center py-8">No active players</p>
						{:else}
							<div class="space-y-3">
								{#each activePlayers as player}
									<div class="flex items-center justify-between p-4 bg-zinc-800 rounded-lg">
										<div class="flex items-center gap-3">
											<img
												src={player.player.steamAvatar}
												alt={player.player.steamUsername}
												class="w-12 h-12 rounded-full"
											/>
											<div>
												<div class="font-semibold text-white">{player.player.steamUsername}</div>
												<div class="text-sm text-gray-400">
													{getRoleName(player.permissionLevel)}
												</div>
											</div>
									</div>
									{#if player.permissionLevel !== 2 && (!data.rosterLocked || data.isGlobalAdmin)}
										<div class="flex gap-2">
											{#if player.permissionLevel === 0}
												<form method="POST" action="?/promotePlayer" use:enhance>
													<input type="hidden" name="playerSteamId" value={player.playerSteamId} />
													<button
														type="submit"
														class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
													>
														Promote
													</button>
												</form>
											{:else if player.permissionLevel === 1}
												<form method="POST" action="?/demotePlayer" use:enhance>
													<input type="hidden" name="playerSteamId" value={player.playerSteamId} />
													<button
														type="submit"
														class="px-3 py-1.5 text-sm bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded transition-colors"
													>
														Demote
													</button>
												</form>
											{/if}
											<form method="POST" action="?/removePlayer" use:enhance>
												<input type="hidden" name="playerSteamId" value={player.playerSteamId} />
												<button
													type="submit"
													onclick={(e) => {
														if (!confirm(`Remove ${player.player.steamUsername} from the team?`)) {
															e.preventDefault();
														}
													}}
													class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
												>
													Remove
												</button>
											</form>
										</div>
									{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else if activeTab === 'pending'}
					<!-- Pending Players Tab -->
					<div>
						<h3 class="text-xl font-bold text-white mb-4">Pending Invitations</h3>
						{#if data.pendingPlayers.length === 0}
							<p class="text-gray-400 text-center py-8">No pending invitations</p>
						{:else}
							<div class="space-y-3">
								{#each data.pendingPlayers as pending}
									<div class="flex items-center justify-between p-4 bg-zinc-800 rounded-lg">
										<div class="flex items-center gap-3">
											<img
												src={pending.player.steamAvatar}
												alt={pending.player.steamUsername}
												class="w-12 h-12 rounded-full"
											/>
											<div>
												<div class="font-semibold text-white">{pending.player.steamUsername}</div>
												<div class="text-sm text-gray-400">Pending approval</div>
											</div>
										</div>
										{#if !data.rosterLocked}
											<div class="flex gap-2">
												<form method="POST" action="?/approvePlayer" use:enhance>
													<input type="hidden" name="playerSteamId" value={pending.playerSteamId} />
													<button
														type="submit"
														class="px-3 py-1.5 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors"
													>
														Approve
													</button>
												</form>
												<form method="POST" action="?/declinePlayer" use:enhance>
													<input type="hidden" name="playerSteamId" value={pending.playerSteamId} />
													<button
														type="submit"
														class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
													>
														Decline
													</button>
												</form>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else if activeTab === 'invite'}
					<!-- Invite Players Tab -->
					<div class="space-y-6">
						<!-- Generate Link -->
						<div>
							<h3 class="text-xl font-bold text-white mb-4">Share Invite Link</h3>
							<p class="text-gray-400 text-sm mb-3">
								Share this link with players to invite them to your team. The link expires after 7
								days.
							</p>
							<div class="flex gap-2">
								<input
									type="text"
									readonly
									value={`${typeof window !== 'undefined' ? window.location.origin : ''}${data.inviteUrl}`}
									class="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-gray-400"
								/>
								<button
									onclick={copyInviteLink}
									class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
								>
									Copy Link
								</button>
							</div>
						</div>

						<hr class="border-zinc-800" />

						<!-- Invite by Steam ID -->
						<form
							method="POST"
							action="?/invitePlayer"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update, result }) => {
									await update();
									isSubmitting = false;
									if (result.type === 'success') {
										// Clear form
										const form = document.querySelector('input[name="steamId"]') as HTMLInputElement;
										if (form) form.value = '';
									}
								};
							}}
						>
							<h3 class="text-xl font-bold text-white mb-4">Invite by Steam ID</h3>
							<div class="space-y-4">
								<div>
									<label for="steamId" class="block text-sm font-medium text-gray-300 mb-2">
										Steam ID (64-bit)
									</label>
									<input
										type="text"
										id="steamId"
										name="steamId"
										placeholder="76561198012345678"
										disabled={data.rosterLocked}
										class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-orange-500"
									/>
								</div>
								<button
									type="submit"
									disabled={isSubmitting || data.rosterLocked}
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
								>
									{isSubmitting ? 'Inviting...' : 'Send Invitation'}
								</button>
							</div>
						</form>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes slide-in {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	:global(.animate-slide-in) {
		animation: slide-in 0.3s ease-out;
	}
</style>
