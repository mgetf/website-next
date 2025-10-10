<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let paypalLoaded = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state<string | null>(null);

	onMount(() => {
		// Load PayPal SDK
		const script = document.createElement('script');
		script.src = `https://www.paypal.com/sdk/js?client-id=${data.paypalClientId}&currency=${data.currency}`;
		script.onload = () => {
			paypalLoaded = true;
			initPayPalButtons();
		};
		document.body.appendChild(script);
	});

	function initPayPalButtons() {
		if (!(window as any).paypal) return;

		(window as any).paypal
			.Buttons({
				createOrder: async () => {
					const response = await fetch('/api/paypal/create-order', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							amount: data.amount,
							currency: data.currency,
							steamId: data.steamId,
							teamId: data.team.id
						})
					});

					const order = await response.json();
					return order.id;
				},
				onApprove: async (data: any) => {
					isProcessing = true;
					const response = await fetch('/api/paypal/capture-order', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							orderID: data.orderID,
							steamId: data.steamId
						})
					});

					const result = await response.json();

					if (result.success) {
						// Redirect to team page
						window.location.href = `/teams/${data.team.id}?payment=success`;
					} else {
						errorMessage = result.error || 'Payment failed';
						isProcessing = false;
					}
				},
				onError: (err: any) => {
					console.error('PayPal error:', err);
					errorMessage = 'An error occurred during payment. Please try again.';
					isProcessing = false;
				}
			})
			.render('#paypal-button-container');
	}
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
	<div class="max-w-2xl mx-auto">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-4xl font-bold text-white mb-2">Complete Payment</h1>
			<p class="text-gray-400">Pay your team signup fee to activate your registration</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
				<p class="text-red-400">{errorMessage}</p>
			</div>
		{/if}

		<!-- Payment Card -->
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
			<!-- Team Info -->
			<div class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-6 border-b border-zinc-800">
				<div class="flex items-center gap-4">
					{#if data.team.avatar}
						<img
							src={data.team.avatar}
							alt={data.team.name}
							class="w-16 h-16 rounded-lg object-cover"
						/>
					{:else}
						<div
							class="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
						>
							<span class="text-2xl text-gray-400">{data.team.name.charAt(0)}</span>
						</div>
					{/if}
					<div>
						<h2 class="text-xl font-bold text-white">{data.team.name}</h2>
						<p class="text-sm text-gray-400">
							{data.division.name} • {data.team.region?.name || 'N/A'}
						</p>
					</div>
				</div>
			</div>

			<!-- Payment Details -->
			<div class="p-8">
				<h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>

				<div class="bg-zinc-800 rounded-lg p-6 mb-6">
					<div class="flex justify-between items-center mb-4">
						<span class="text-gray-400">Division Signup Fee</span>
						<span class="text-white font-semibold">
							{data.currency === 'EUR' ? '€' : '$'}{data.amount.toFixed(2)}
						</span>
					</div>
					<div class="border-t border-zinc-700 pt-4 flex justify-between items-center">
						<span class="text-white font-bold">Total Due</span>
						<span class="text-2xl font-bold text-white">
							{data.currency === 'EUR' ? '€' : '$'}{data.amount.toFixed(2)}
						</span>
					</div>
				</div>

				<!-- PayPal Button Container -->
				{#if isProcessing}
					<div class="text-center py-8">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
						<p class="text-gray-400">Processing payment...</p>
					</div>
				{:else if !paypalLoaded}
					<div class="text-center py-8">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
						<p class="text-gray-400">Loading payment options...</p>
					</div>
				{:else}
					<div id="paypal-button-container"></div>
				{/if}

				<!-- Info -->
				<div class="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
					<p class="text-blue-400 text-sm">
						<strong>Note:</strong> Payment is processed securely through PayPal. Once payment is
						confirmed, your team registration will be activated.
					</p>
				</div>
			</div>
		</div>

		<!-- Back Link -->
		<div class="text-center mt-6">
			<a
				href="/teams/{data.team.id}"
				class="text-gray-400 hover:text-white transition-colors"
			>
				← Back to Team Page
			</a>
		</div>
	</div>
</div>


