<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, tick } from 'svelte';

	let { data: pageData }: { data: PageData } = $props();

	let paypalLoaded = $state(false);
	let buttonsInitialized = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state<string | null>(null);

	onMount(() => {
		// In test mode, skip PayPal SDK loading entirely
		if (pageData.isTestMode) {
			paypalLoaded = true;
			return;
		}

		// Validate PayPal client ID before loading
		if (!pageData.paypalClientId || pageData.paypalClientId.length < 10) {
			errorMessage = 'PayPal is not configured. Please contact support.';
			return;
		}

		// Check if PayPal SDK is already loaded (e.g., from previous navigation)
		if ((window as any).paypal) {
			paypalLoaded = true;
			return;
		}

		// Load PayPal SDK
		const script = document.createElement('script');
		script.src = `https://www.paypal.com/sdk/js?client-id=${pageData.paypalClientId}&currency=${pageData.currency}`;
		script.async = true;
		script.onload = () => {
			paypalLoaded = true;
		};
		script.onerror = () => {
			errorMessage = 'Failed to load PayPal. Please check your internet connection and refresh.';
		};
		document.body.appendChild(script);
	});

	// Use $effect to initialize buttons when paypalLoaded becomes true
	// This ensures the DOM has updated and the container exists
	$effect(() => {
		if (paypalLoaded && !buttonsInitialized && !pageData.isTestMode) {
			// Wait for DOM to update after paypalLoaded changes
			tick().then(() => {
				initPayPalButtons();
			});
		}
	});

	/**
	 * Process a test payment (mock flow)
	 */
	async function processTestPayment() {
		isProcessing = true;
		errorMessage = null;

		try {
			// Step 1: Create mock order
			const createResponse = await fetch('/api/paypal/create-order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: pageData.amount,
					currency: pageData.currency,
					steamId: pageData.steamId,
					teamId: pageData.team.id
				})
			});

			const order = await createResponse.json();

			if (!createResponse.ok || order.error) {
				throw new Error(order.error || 'Failed to create test order');
			}

			// Step 2: Capture mock order
			const captureResponse = await fetch('/api/paypal/capture-order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderID: order.id,
					steamId: pageData.steamId,
					teamId: pageData.team.id,
					amount: pageData.amount,
					currency: pageData.currency
				})
			});

			const result = await captureResponse.json();

			if (result.success) {
				window.location.href = `/teams/${result.teamId || pageData.team.id}?payment=success`;
			} else {
				errorMessage = result.error || 'Test payment failed.';
				isProcessing = false;
			}
		} catch (err: any) {
			errorMessage = err.message || 'Test payment failed.';
			isProcessing = false;
		}
	}

	function initPayPalButtons() {
		if (buttonsInitialized) {
			return;
		}

		if (!(window as any).paypal) {
			errorMessage = 'PayPal failed to initialize. Please refresh the page.';
			return;
		}

		const container = document.getElementById('paypal-button-container');
		if (!container) {
			// Retry after a short delay
			setTimeout(() => initPayPalButtons(), 100);
			return;
		}

		// Mark as initialized to prevent duplicate initialization
		buttonsInitialized = true;

		// Clear any existing buttons
		container.innerHTML = '';

		try {
			(window as any).paypal
				.Buttons({
					style: {
						layout: 'vertical',
						color: 'gold',
						shape: 'rect',
						label: 'paypal'
					},
					createOrder: async () => {
						try {
							errorMessage = null; // Clear any previous errors
							
							const response = await fetch('/api/paypal/create-order', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									amount: pageData.amount,
									currency: pageData.currency,
									steamId: pageData.steamId,
									teamId: pageData.team.id
								})
							});

							const order = await response.json();

							if (!response.ok || order.error) {
								throw new Error(order.error || 'Failed to create order');
							}

							return order.id;
						} catch (err: any) {
							errorMessage = err.message || 'Failed to create payment order. Please try again.';
							throw err;
						}
					},
					onApprove: async (paypalData: { orderID: string }) => {
						isProcessing = true;
						errorMessage = null;
						
						try {
							const response = await fetch('/api/paypal/capture-order', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									orderID: paypalData.orderID,
									steamId: pageData.steamId
								})
							});

							const result = await response.json();

							if (result.success) {
								window.location.href = `/teams/${result.teamId || pageData.team.id}?payment=success`;
							} else {
								errorMessage = result.error || 'Payment failed. Please contact support.';
								isProcessing = false;
							}
						} catch (err: any) {
							errorMessage = 'Failed to complete payment. Please contact support.';
							isProcessing = false;
						}
					},
					onCancel: () => {
						// User intentionally cancelled - no error message needed
					},
					onError: (err: any) => {
						// Don't show error if buttons haven't rendered yet - it's a render error
						if (container.children.length === 0) {
							errorMessage = 'PayPal configuration error. Please contact support.';
						} else {
							errorMessage = 'An error occurred during payment. Please try again.';
						}
						isProcessing = false;
					}
				})
				.render('#paypal-button-container')
				.catch((err: any) => {
					buttonsInitialized = false; // Allow retry
					errorMessage = 'Failed to display PayPal buttons. Please refresh or try a different browser.';
				});
		} catch (err: any) {
			errorMessage = 'Failed to initialize PayPal. Please refresh the page.';
		}
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
					{#if pageData.team.avatar}
						<img
							src={pageData.team.avatar}
							alt={pageData.team.name}
							class="w-16 h-16 rounded-lg object-cover"
						/>
					{:else}
						<div
							class="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
						>
							<span class="text-2xl text-gray-400">{pageData.team.name.charAt(0)}</span>
						</div>
					{/if}
					<div>
						<h2 class="text-xl font-bold text-white">{pageData.team.name}</h2>
						<p class="text-sm text-gray-400">
							{pageData.division.name} • {pageData.team.region?.name || 'N/A'}
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
							{pageData.currency === 'EUR' ? '€' : '$'}{pageData.amount.toFixed(2)}
						</span>
					</div>
					<div class="border-t border-zinc-700 pt-4 flex justify-between items-center">
						<span class="text-white font-bold">Total Due</span>
						<span class="text-2xl font-bold text-white">
							{pageData.currency === 'EUR' ? '€' : '$'}{pageData.amount.toFixed(2)}
						</span>
					</div>
				</div>

				<!-- PayPal Button Container -->
				{#if isProcessing}
					<div class="text-center py-8">
						<div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
						<p class="text-gray-400">Processing payment...</p>
					</div>
				{:else if pageData.isTestMode}
					<!-- Test Mode: Show test payment button -->
					<div class="space-y-4">
						<div class="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
							<p class="text-yellow-400 text-sm font-medium">
								⚠️ TEST MODE - No real payment will be processed
							</p>
						</div>
						<button
							onclick={processTestPayment}
							class="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors text-lg"
						>
							Complete Test Payment
						</button>
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
						{#if pageData.isTestMode}
							<strong>Test Mode:</strong> This is a simulated payment for development. No real charges will be made.
						{:else}
							<strong>Note:</strong> Payment is processed securely through PayPal. Once payment is
							confirmed, your team registration will be activated.
						{/if}
					</p>
				</div>
			</div>
		</div>

		<!-- Back Link -->
		<div class="text-center mt-6">
			<a
				href="/teams/{pageData.team.id}"
				class="text-gray-400 hover:text-white transition-colors"
			>
				← Back to Team Page
			</a>
		</div>
	</div>
</div>
