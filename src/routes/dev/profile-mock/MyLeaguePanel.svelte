<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormatBadge from '$lib/components/ui/FormatBadge.svelte';
  import { leagueMatchStatusColor, leagueMatchStatusLabel, type LeagueHubRow } from './mock-data';

  let { rows }: { rows: LeagueHubRow[] } = $props();
</script>

<div class="flex flex-col gap-3">
  <div>
    <h2 class="text-sm font-semibold text-white">My league</h2>
    <p class="mt-1 text-xs text-text-muted">
      Staff preview. Where this player stands this season, at a glance. Not public yet.
    </p>
  </div>

  {#if rows.length === 0}
    <Card>
      <p class="py-6 text-center text-sm text-text-muted">
        Not in any active 1v1, 2v2, Ultiduo, or BBall season.
      </p>
    </Card>
  {:else}
    <div class="grid gap-3 lg:grid-cols-2">
      {#each rows as row (row.id)}
        <Card padding="sm">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <FormatBadge
              name={row.formatName}
              themeKey={row.formatThemeKey}
              iconUrl={row.formatIconUrl}
            />
            <span class="min-w-0 truncate text-sm font-medium text-white">{row.context}</span>
            <Badge color={leagueMatchStatusColor(row.matchStatus)} class="ml-auto">
              {leagueMatchStatusLabel(row.matchStatus)}
            </Badge>
          </div>

          <p class="text-xs text-text-muted">
            {row.division} · {row.region} · S{row.seasonNum}
            {#if row.weekNo > 0}
              · Week {row.weekNo} of {row.weekTotal}
            {/if}
          </p>

          <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p class="text-xs text-text-muted">Standing</p>
              <p class="mt-0.5 text-sm font-medium text-white">{row.standing}</p>
            </div>
            <div>
              <p class="text-xs text-text-muted">Record</p>
              <p class="mt-0.5 font-mono text-sm text-white">{row.record}</p>
            </div>
            <div>
              <p class="text-xs text-text-muted">This match</p>
              <p class="mt-0.5 truncate text-sm text-white">{row.opponent}</p>
            </div>
            <div>
              <p class="text-xs text-text-muted">Score</p>
              <p class="mt-0.5 font-mono text-sm text-text-label">{row.score}</p>
            </div>
          </div>

          <p class="mt-3 text-xs text-text-muted">{row.note}</p>
        </Card>
      {/each}
    </div>
  {/if}
</div>
