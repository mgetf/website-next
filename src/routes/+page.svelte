<script lang="ts">
	// Placeholder data – wire to your API later via +page.server.ts
	const regions = ['EU', 'NA', 'ASIA', 'AUS', 'SA'] as const;
	let activeRegion = $state<(typeof regions)[number]>('EU');

	const seasonsByRegion: Record<string, number[]> = {
		EU: [1, 2, 3, 4, 5],
		NA: [1, 2, 3, 4, 5],
		ASIA: [1, 2],
		AUS: [1, 2, 3],
		SA: [1, 2]
	};
	let activeSeason = $state(2);

	let showStaff = $state(false);
	const staff: Array<{ name: string; role: string; division?: string }>
		= [
			{ name: 'ampere', role: 'Head Admin' },
			{ name: 'mod_1', role: 'Moderator', division: 'Premier' },
			{ name: 'mod_2', role: 'Moderator', division: 'Intermediate' }
		];

	const status = {
		registration: { label: 'Team Registration Closes', state: 'CLOSED', date: null as string | null },
		payments: {
			label: 'Payments Due',
			regions: [
				{ region: 'NA (EST)', state: 'CLOSED', date: null as string | null },
				{ region: 'EU (CET)', state: 'CLOSED', date: null as string | null }
			]
		}
	};

	const standings = [
		{
			division: 'PREMIER',
			teams: [
				{ name: 'WARHAMMER', record: '2 - 0', ppg: 20.0 },
				{ name: 'PRO PRO', record: '2 - 0', ppg: 20.0 },
				{ name: 'Avalon', record: '2 - 0', ppg: 10.7 },
				{ name: 'abc123', record: '2 - 0', ppg: 7.4 }
			]
		},
		{
			division: 'INTERMEDIATE',
			teams: [
				{ name: 'Loud Pissers', record: '2 - 0', ppg: 20.0 },
				{ name: 'FC Liski', record: '2 - 0', ppg: 19.1 },
				{ name: 'Republic of gamers', record: '1 - 0', ppg: 20.0 }
			]
		}
	];

	function goToSeason() {
		// Placeholder: navigate or reload data
		console.log('Region/Season:', activeRegion, activeSeason);
	}
</script>

<!-- Announcement banner -->
<section class="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]/85 backdrop-blur px-3 py-2 text-sm">
	<strong class="mr-2">Week 1 matches have been posted.</strong>
	Reach out to your opponent ASAP. Servers will be announced in Discord at the time of matches.
</section>

<!-- Logo/title -->
<section class="mt-4 flex items-center gap-3">
	<img src="/favicon.svg" alt="MGE" width="36" height="36" />
	<h1 class="m-0 text-3xl font-extrabold tracking-tight">MGE LEAGUE</h1>
</section>

<!-- Controls: Region & Season -->
<section class="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3">
	<div class="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
		<div>
			<div class="block text-xs text-[color:var(--muted)] mb-1">Region</div>
			<div class="flex gap-2 flex-wrap">
		{#each regions as r}
					<button
						class="rounded-full border border-[color:var(--border)] px-3 py-1 text-[#d5deea] data-[active=true]:bg-[color:var(--accent)] data-[active=true]:text-[#07140b]"
				data-active={activeRegion === r}
				on:click={() => {
					activeRegion = r;
					const list = seasonsByRegion[r];
					if (list && !list.includes(activeSeason)) activeSeason = list.at(-1) ?? 1;
				}}
					>{r}</button>
				{/each}
			</div>
		</div>
		<div>
			<label for="season" class="block text-xs text-[color:var(--muted)] mb-1">Season</label>
		<select id="season" class="w-full rounded-lg border border-[color:var(--border)] bg-[#0f141b] px-3 py-2 text-[#e5e7eb]" bind:value={activeSeason}>
			{#each seasonsByRegion[activeRegion] as s}
					<option value={s}>Season {s}</option>
				{/each}
			</select>
		</div>
		<div class="flex md:justify-end"><button class="rounded-lg bg-[color:var(--accent)] px-4 py-2 font-bold text-[#07140b]" on:click={goToSeason}>Go</button></div>
	</div>
</section>

<!-- Staff & Status Row -->
<section class="mt-4 grid gap-4 md:grid-cols-3">
	<!-- Staff list (collapsible) -->
	<div class="md:col-span-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3">
		<div class="flex items-center justify-between">
			<div class="text-sm font-semibold">Staff List</div>
			<button class="text-sm text-[color:var(--muted)] hover:text-inherit" on:click={() => (showStaff = !showStaff)}>{showStaff ? 'hide' : 'show'}</button>
		</div>
		{#if showStaff}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="text-[color:var(--muted)]">
						<tr>
							<th class="text-left font-medium py-1 pr-2">Name</th>
							<th class="text-left font-medium py-1 pr-2">Role</th>
							<th class="text-left font-medium py-1">Division</th>
						</tr>
					</thead>
					<tbody>
						{#each staff as s}
							<tr class="border-t border-[color:var(--border)]">
								<td class="py-2 pr-2">{s.name}</td>
								<td class="py-2 pr-2">{s.role}</td>
								<td class="py-2">{s.division ?? '-'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Registration status tile -->
	<div class="rounded-xl border border-[color:var(--border)] bg-gradient-to-b from-[#141923] to-[#0f141b] p-4 text-center">
		<div class="text-xs tracking-wide text-[color:var(--muted)]">{status.registration.label}</div>
		<div class="mt-2 text-2xl font-extrabold text-[#ff6b6b]">{status.registration.state}</div>
		{#if status.registration.date}
			<div class="mt-1 text-xs text-[color:var(--muted)]">{status.registration.date}</div>
		{/if}
	</div>

	<!-- Payments status tile -->
	<div class="rounded-xl border border-[color:var(--border)] bg-gradient-to-b from-[#141923] to-[#0f141b] p-4">
		<div class="text-center text-xs tracking-wide text-[color:var(--muted)]">{status.payments.label}</div>
		<div class="mt-2 grid gap-2">
			{#each status.payments.regions as r}
				<div class="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[#0f141b] px-3 py-2">
					<span class="text-sm">{r.region}</span>
					<span class="text-lg font-extrabold text-[#ff6b6b]">{r.state}</span>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- Standings by division -->
<section class="mt-6 grid gap-6">
	{#each standings as group}
		<div class="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
			<div class="px-4 py-3 text-center text-lg font-extrabold tracking-wide">{group.division} ({activeRegion})</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-[#0f141b] text-[color:var(--muted)]">
						<tr>
							<th class="text-left font-medium px-4 py-2">Team</th>
							<th class="text-left font-medium px-4 py-2">Record</th>
							<th class="text-left font-medium px-4 py-2">Avg Points</th>
						</tr>
					</thead>
					<tbody>
						{#each group.teams as t, i}
							<tr class="border-t border-[color:var(--border)] hover:bg-[#131a23]">
								<td class="px-4 py-2">{t.name}</td>
								<td class="px-4 py-2">{t.record}</td>
								<td class="px-4 py-2">{t.ppg.toFixed(1)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/each}
</section>

<style>
	section { scroll-margin-top: 64px; }
</style>