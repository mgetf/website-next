<script>
	import '../app.css';
	let navOpen = $state(false);
	const nav = [
		{ href: '/standings', label: 'Standings' },
		{ href: '/matches', label: 'Matches' },
		{ href: '/teams', label: 'Teams' },
		{ href: '/tournaments', label: 'Tournaments' },
		{ href: '/forums', label: 'Forums' }
	];
</script>

<svelte:head>
	<title>MGE — Play. Compete. Improve.</title>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="app">
	<header class="header">
		<a class="brand" href="/">
			<img alt="MGE" src="https://placehold.co/28x28/png" />
			<span>MGE</span>
		</a>

		<nav class="desktop">
			{#each nav as item}
				<a class="navlink" href={item.href}>{item.label}</a>
			{/each}
			<a class="navlink" href="/discord">Discord</a>
			<a class="cta" href="/signup">Sign up</a>
		</nav>

		<button class="burger" aria-label="Menu" on:click={() => (navOpen = !navOpen)}>☰</button>
	</header>

	{#if navOpen}
		<nav class="mobile">
			{#each nav as item}
				<a class="navlink" href={item.href} on:click={() => (navOpen = false)}>{item.label}</a>
			{/each}
			<a class="navlink" href="/discord" on:click={() => (navOpen = false)}>Discord</a>
			<a class="cta" href="/signup" on:click={() => (navOpen = false)}>Sign up</a>
		</nav>
	{/if}

	<main class="main">
		<slot />
	</main>

	<footer class="footer">
		<div>© {new Date().getFullYear()} MGE</div>
		<nav class="footnav">
			<a href="/rulebook">Rulebook</a>
			<a href="/league">League</a>
			<a href="/health">Status</a>
		</nav>
	</footer>
</div>

<style>
	:root {
		/* Subtle, neutral dark palette */
		--bg: #0e1116; /* slate-950-ish */
		--panel: #111418; /* header/nav panels */
		--card: #0f131a; /* content cards */
		--border: #232a36; /* slate-800 */
		--text: #e5e7eb; /* slate-200 */
		--muted: #9aa4b2; /* slate-400/500 */
		--accent: #8dce79; /* emerald-500 */
		color-scheme: dark;
	}
    * { box-sizing: border-box; }
	:global(html), :global(body), .app { height: 100%; margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji; }
	a { color: inherit; text-decoration: none; }
	.header { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; background: color-mix(in oklab, var(--panel) 92%, black 8% / 80%); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
	.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .3px; }
	.desktop { display: none; align-items: center; gap: 14px; }
	.burger { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 8px; }
	.mobile { display: grid; gap: 10px; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.navlink { padding: 8px 10px; color: var(--muted); transition: color .15s ease; }
	.navlink:hover { color: var(--text); }
	.cta { padding: 8px 12px; background: var(--accent); color: #0b1a10; border-radius: 10px; font-weight: 700; }
	.main { padding: 18px; max-width: 1160px; margin: 0 auto; }
	.footer { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-top: 1px solid var(--border); color: var(--muted); }
	.footnav { display: flex; gap: 12px; }
	@media (min-width: 900px) {
		.desktop { display: flex; }
		.burger { display: none; }
		.mobile { display: none; }
		.main { padding: 28px; }
	}
</style>