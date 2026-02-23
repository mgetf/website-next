<script lang="ts">
import type { PageData } from './$types';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import DataTable from '$lib/components/ui/DataTable.svelte';
import SelectFilter from '$lib/components/ui/SelectFilter.svelte';

let { data }: { data: PageData } = $props();

type LogEntry = {
	id: number;
	timestamp: string;
	actorId: string | null;
	actorRole: string | null;
	actorUsername: string | null;
	actorAvatar: string | null;
	category: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	targetUsername: string | null;
	targetAvatar: string | null;
	metadata: unknown;
	ipAddress: string | null;
};

let expandedRow = $state<number | null>(null);

let filterCategory = $state('');
let filterAction = $state('');
let filterActorId = $state('');
let filterTargetType = $state('');
let filterTargetId = $state('');
let filterDateFrom = $state('');
let filterDateTo = $state('');

$effect(() => {
	filterCategory = data.filters.category;
	filterAction = data.filters.action;
	filterActorId = data.filters.actorId;
	filterTargetType = data.filters.targetType;
	filterTargetId = data.filters.targetId;
	filterDateFrom = data.filters.dateFrom;
	filterDateTo = data.filters.dateTo;
});

const logs = $derived(data.logs as LogEntry[]);
const categoryOptions = $derived(data.categories.map((c: string) => ({ value: c, label: c })));

const columns = [
	{ key: 'timestamp', label: 'Time', width: '145px' },
	{ key: 'actor', label: 'Actor', width: '160px' },
	{ key: 'category', label: 'Category', width: '100px' },
	{ key: 'action', label: 'Action' },
	{ key: 'target', label: 'Target', width: '160px' },
	{ key: 'ip', label: 'IP', width: '100px' },
	{ key: 'expand', label: '', width: '28px', srOnly: true },
];

const targetTypeOptions = [
	{ value: 'User', label: 'User' },
	{ value: 'Team', label: 'Team' },
	{ value: 'Match', label: 'Match' },
	{ value: 'Demo', label: 'Demo' },
	{ value: 'DemoReport', label: 'Demo Report' },
	{ value: 'Season', label: 'Season' },
	{ value: 'Region', label: 'Region' },
	{ value: 'Division', label: 'Division' },
	{ value: 'Arena', label: 'Arena' },
	{ value: 'Format', label: 'Format' },
	{ value: 'Tournament', label: 'Tournament' },
	{ value: 'Announcement', label: 'Announcement' },
];

function getCategoryColor(cat: string): string {
	switch (cat) {
		case 'AUTH': return 'bg-blue-500/20 text-blue-400';
		case 'USER': return 'bg-purple-500/20 text-purple-400';
		case 'TEAM': return 'bg-green-500/20 text-green-400';
		case 'ROSTER': return 'bg-teal-500/20 text-teal-400';
		case 'MATCH': return 'bg-orange-500/20 text-orange-400';
		case 'MAP_BAN': return 'bg-yellow-500/20 text-yellow-400';
		case 'SIGNUP': return 'bg-cyan-500/20 text-cyan-400';
		case 'PAYMENT': return 'bg-emerald-500/20 text-emerald-400';
		case 'DEMO': return 'bg-pink-500/20 text-pink-400';
		case 'LEAGUE_CONFIG': return 'bg-indigo-500/20 text-indigo-400';
		case 'TOURNAMENT': return 'bg-rose-500/20 text-rose-400';
		case 'SITE': return 'bg-gray-500/20 text-gray-400';
		default: return 'bg-zinc-700 text-zinc-300';
	}
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString('en-GB', {
		day: '2-digit', month: '2-digit', year: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit',
		hour12: false
	});
}

function applyFilters() {
	const params = new URLSearchParams(page.url.searchParams);
	params.set('page', '1');
	const sd = (k: string, v: string) => v ? params.set(k, v) : params.delete(k);
	sd('category', filterCategory);
	sd('action', filterAction);
	sd('actorId', filterActorId);
	sd('targetType', filterTargetType);
	sd('targetId', filterTargetId);
	sd('dateFrom', filterDateFrom);
	sd('dateTo', filterDateTo);
	goto(`?${params.toString()}`, { keepFocus: true });
}

function clearFilters() {
	goto('/admin/audit-logs', { keepFocus: true });
}

function goToPage(p: number) {
	const params = new URLSearchParams(page.url.searchParams);
	params.set('page', String(p));
	goto(`?${params.toString()}`);
}

function toggleRow(log: LogEntry) {
	if (!log.metadata) return;
	expandedRow = expandedRow === log.id ? null : log.id;
}

const paginationInfo = $derived(
	`Showing ${((data.pagination.page - 1) * data.pagination.pageSize) + 1}–${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)} of ${data.pagination.totalCount.toLocaleString()}`
);
</script>

<svelte:head>
	<title>Audit Logs — Admin</title>
</svelte:head>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Audit Logs</h2>
		<p class="text-gray-400">{data.pagination.totalCount.toLocaleString()} total entries recorded</p>
	</div>

	<!-- Category quick-filter pills -->
	{#if data.stats.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each data.stats as stat}
				<button
					onclick={() => {
						filterCategory = filterCategory === stat.category ? '' : stat.category;
						applyFilters();
					}}
					class="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-sm
						{filterCategory === stat.category
							? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
							: 'border-zinc-700 bg-zinc-900 text-gray-400 hover:border-zinc-600 hover:text-gray-200'}"
				>
					<span class="px-1.5 py-0.5 rounded text-xs font-medium {getCategoryColor(stat.category)}">
						{stat.category}
					</span>
					<span class="font-mono text-xs">{stat.count.toLocaleString()}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<SelectFilter
				value={filterCategory}
				options={categoryOptions}
				allLabel="All Categories"
				onChange={(v) => { filterCategory = v; }}
			/>

			<div>
				<label for="f-action" class="sr-only">Action</label>
				<input
					id="f-action"
					type="text"
					bind:value={filterAction}
					placeholder="Action (e.g. USER_BANNED)"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>

			<div>
				<label for="f-actor" class="sr-only">Actor Steam ID</label>
				<input
					id="f-actor"
					type="text"
					bind:value={filterActorId}
					placeholder="Actor Steam ID"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>

			<SelectFilter
				value={filterTargetType}
				options={targetTypeOptions}
				allLabel="All Target Types"
				onChange={(v) => { filterTargetType = v; }}
			/>

			<div>
				<label for="f-target-id" class="sr-only">Target ID</label>
				<input
					id="f-target-id"
					type="text"
					bind:value={filterTargetId}
					placeholder="Target ID"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>

			<div>
				<label for="f-from" class="sr-only">From date</label>
				<input
					id="f-from"
					type="date"
					bind:value={filterDateFrom}
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>

			<div>
				<label for="f-to" class="sr-only">To date</label>
				<input
					id="f-to"
					type="date"
					bind:value={filterDateTo}
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
				/>
			</div>

			<div class="flex gap-2">
				<button
					onclick={applyFilters}
					class="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
				>
					Apply
				</button>
				<button
					onclick={clearFilters}
					class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors"
				>
					Clear
				</button>
			</div>
		</div>
	</div>

	<!-- Table -->
	<DataTable
		data={logs}
		{columns}
		compact
		emptyMessage="No audit log entries found"
		onRowClick={toggleRow}
		rowClass={(log) => log.metadata ? 'cursor-pointer' : ''}
		expandedRow={(log) => expandedRow === log.id}
		pagination={{
			currentPage: data.pagination.page,
			totalPages: data.pagination.totalPages,
			onPageChange: goToPage,
			infoText: paginationInfo
		}}
	>
		{#snippet cell(log, col)}
			{#if col.key === 'timestamp'}
				<span class="font-mono text-xs text-gray-400 whitespace-nowrap">
					{formatTimestamp(log.timestamp)}
				</span>
			{:else if col.key === 'actor'}
				{#if log.actorId}
					<div class="flex items-center gap-2 min-w-0">
						{#if log.actorAvatar}
							<img src={log.actorAvatar} alt="" class="w-5 h-5 rounded flex-shrink-0" />
						{/if}
						<a
							href="/users/{log.actorId}"
							onclick={(e) => e.stopPropagation()}
							class="text-xs text-white hover:text-orange-400 transition-colors truncate"
						>
							{log.actorUsername ?? log.actorId}
						</a>
					</div>
				{:else}
					<span class="text-xs text-gray-500">System</span>
				{/if}
			{:else if col.key === 'category'}
				<span class="px-2 py-0.5 rounded text-xs font-medium {getCategoryColor(log.category)}">
					{log.category}
				</span>
			{:else if col.key === 'action'}
				<span class="font-mono text-xs text-gray-200">{log.action}</span>
		{:else if col.key === 'target'}
			{#if log.targetType === 'User' && log.targetId}
				<div class="flex items-center gap-2 min-w-0">
					{#if log.targetAvatar}
						<img src={log.targetAvatar} alt="" class="w-5 h-5 rounded flex-shrink-0" />
					{/if}
					<a
						href="/users/{log.targetId}"
						onclick={(e) => e.stopPropagation()}
						class="text-xs text-white hover:text-orange-400 transition-colors truncate"
					>
						{log.targetUsername ?? log.targetId}
					</a>
				</div>
			{:else if log.targetType}
				<span class="text-xs text-gray-500">{log.targetType}</span>
				{#if log.targetId}
					<span class="text-xs text-gray-400 ml-1 font-mono">#{log.targetId}</span>
				{/if}
			{:else}
				<span class="text-xs text-gray-600">—</span>
			{/if}
			{:else if col.key === 'ip'}
				<span class="font-mono text-xs text-gray-500">{log.ipAddress ?? '—'}</span>
			{:else if col.key === 'expand'}
				{#if log.metadata}
					<span class="text-gray-500 text-xs select-none">
						{expandedRow === log.id ? '▲' : '▼'}
					</span>
				{/if}
			{/if}
		{/snippet}

		{#snippet expandedContent(log)}
			<pre class="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{JSON.stringify(log.metadata, null, 2)}</pre>
		{/snippet}
	</DataTable>
</div>
