<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Auth Test - MGE.tf</title>
</svelte:head>

<div class="container mx-auto p-8 max-w-2xl">
	<h1 class="text-3xl font-bold mb-6">Authentication Test</h1>

	{#if data.user}
		<div class="bg-green-100 border border-green-400 text-green-700 px-6 py-4 rounded-lg mb-6">
			<h2 class="text-xl font-bold mb-4">✅ Logged In</h2>
			
			<div class="flex items-center gap-4 mb-4">
				<img src={data.user.steamAvatar} alt="Steam Avatar" class="w-16 h-16 rounded" />
				<div>
					<p class="font-bold text-lg">{data.user.steamUsername}</p>
					<p class="text-sm text-gray-600">Steam ID: {data.user.steamId}</p>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4 mb-4">
				<div>
					<p class="text-sm font-semibold">Permission Level:</p>
					<p class="text-lg">{data.user.permissionLevel}</p>
				</div>
				<div>
					<p class="text-sm font-semibold">Ban Status:</p>
					<p class="text-lg">{data.user.banStatus}</p>
				</div>
			</div>

			<form method="POST" action="/auth/logout">
				<button
					type="submit"
					class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded transition"
				>
					Logout
				</button>
			</form>
		</div>
	{:else}
		<div class="bg-blue-100 border border-blue-400 text-blue-700 px-6 py-4 rounded-lg mb-6">
			<h2 class="text-xl font-bold mb-4">🔒 Not Logged In</h2>
			<p class="mb-4">
				Click the button below to test Steam OpenID authentication.
			</p>

			<a
				href="/auth/login?redirect=/test-auth"
				class="inline-block bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded transition font-semibold"
			>
				Login with Steam
			</a>
		</div>
	{/if}

	<div class="bg-gray-100 border border-gray-300 px-6 py-4 rounded-lg">
		<h3 class="font-bold mb-2">Test Instructions:</h3>
		<ol class="list-decimal list-inside space-y-2 text-sm">
			<li>Click "Login with Steam" if not logged in</li>
			<li>You'll be redirected to Steam's login page</li>
			<li>After approving, you'll return here with session data</li>
			<li>Your info should persist across page reloads</li>
			<li>Click "Logout" to clear your session</li>
		</ol>
	</div>
</div>

