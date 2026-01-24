<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
	<div class="max-w-5xl w-full">
		<div class="text-center mb-12">
			<h1 class="text-4xl font-bold text-white mb-4">League Signups</h1>
			<p class="text-gray-400 text-lg">
				Sign up for the upcoming season
			</p>
		</div>

		{#if data.allSignupsClosed}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🔒</div>
				<h2 class="text-2xl font-bold text-white mb-4">Signups Are Closed</h2>
				<p class="text-gray-400 text-lg">
					Signups are not currently open. Check back later or join our Discord for updates.
				</p>
				<a
					href="/"
					class="inline-block mt-6 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					Back to Home
				</a>
			</div>
		{:else}
			<!-- 2v2 Team Section -->
			<div class="mb-8">
				<h2 class="text-xl font-semibold text-gray-300 mb-4">2v2 Teams</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Create New Team -->
				{#if data.canCreateNew}
					<a
						href="/signup/create"
						class="group bg-zinc-900 border border-zinc-800 hover:border-orange-500 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-orange-500/20"
					>
						<div class="text-center">
							<div class="text-6xl mb-4 group-hover:scale-110 transition-transform">✨</div>
							<h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
							<p class="text-gray-400 mb-4">
								Start fresh with a brand new team for this season
							</p>
							<div class="inline-block px-4 py-2 bg-orange-600 text-white rounded-lg group-hover:bg-orange-500 transition-colors">
								Get Started →
							</div>
						</div>
					</a>
				{:else}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-8 opacity-60 cursor-not-allowed">
						<div class="text-center">
							<div class="text-6xl mb-4">✨</div>
							<h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
							<p class="text-gray-400 mb-4">
								Start fresh with a brand new team for this season
							</p>
							<div class="inline-block px-4 py-2 bg-gray-600 text-gray-300 rounded-lg cursor-not-allowed">
								Unavailable
							</div>
							<p class="text-sm text-yellow-400 mt-4">
								&#9888;&#65039; {data.createDisabledReason}
							</p>
						</div>
					</div>
				{/if}

				<!-- Re-register Existing Team -->
				{#if data.canReregister}
					<a
						href="/signup/existing"
						class="group bg-zinc-900 border border-zinc-800 hover:border-blue-500 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-blue-500/20"
					>
						<div class="text-center">
							<div class="text-6xl mb-4 group-hover:scale-110 transition-transform">🔄</div>
							<h2 class="text-2xl font-bold text-white mb-3">Re-register Team</h2>
							<p class="text-gray-400 mb-4">
								Sign up an existing team for the new season
							</p>
							<div class="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg group-hover:bg-blue-500 transition-colors">
								Continue →
							</div>
						</div>
					</a>
				{:else}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-8 opacity-60 cursor-not-allowed">
						<div class="text-center">
							<div class="text-6xl mb-4">🔄</div>
							<h2 class="text-2xl font-bold text-white mb-3">Re-register Team</h2>
							<p class="text-gray-400 mb-4">
								Sign up an existing team for the new season
							</p>
							<div class="inline-block px-4 py-2 bg-gray-600 text-gray-300 rounded-lg cursor-not-allowed">
								Unavailable
							</div>
							<p class="text-sm text-yellow-400 mt-4">
								&#9888;&#65039; {data.reregisterDisabledReason}
							</p>
						</div>
					</div>
				{/if}
				</div>
			</div>

			<!-- 1v1 Individual Section -->
			{#if data.activeFormatCodes.includes('1v1')}
				<div class="mb-8">
					<h2 class="text-xl font-semibold text-gray-300 mb-4">1v1 Individual</h2>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- 1v1 Signup -->
						{#if data.can1v1Signup}
							<a
								href="/signup/1v1"
								class="group bg-zinc-900 border border-zinc-800 hover:border-purple-500 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-purple-500/20"
							>
								<div class="text-center">
									<div class="text-6xl mb-4 group-hover:scale-110 transition-transform">&#127919;</div>
									<h2 class="text-2xl font-bold text-white mb-3">1v1 League</h2>
									<p class="text-gray-400 mb-4">
										Sign up as an individual player for 1v1 matches
									</p>
									<div class="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg group-hover:bg-purple-500 transition-colors">
										Sign Up &rarr;
									</div>
								</div>
							</a>
						{:else}
							<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-8 opacity-60 cursor-not-allowed">
								<div class="text-center">
									<div class="text-6xl mb-4">&#127919;</div>
									<h2 class="text-2xl font-bold text-white mb-3">1v1 League</h2>
									<p class="text-gray-400 mb-4">
										Sign up as an individual player for 1v1 matches
									</p>
									<div class="inline-block px-4 py-2 bg-gray-600 text-gray-300 rounded-lg cursor-not-allowed">
										Unavailable
									</div>
									<p class="text-sm text-yellow-400 mt-4">
										&#9888;&#65039; {data.signup1v1DisabledReason}
									</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<div class="mt-8 text-center text-gray-500 text-sm">
				<p>Need help? Check out our <a href="/rulebook" class="text-orange-500 hover:text-orange-400">rulebook</a> or join our Discord</p>
			</div>
		{/if}
	</div>
</div>


