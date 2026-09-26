<script lang="ts">
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import type { TeamAdminDivision, TeamRosterPlayer } from '$lib/types/team';

  const DEFAULT_AVATAR = '/default-avatar.png';

  let {
    teamStatus,
    divisionId,
    divisions,
    isFreeDivision,
    unpaidPlayers,
    paidPlayers,
    busy,
    onMarkPaid,
    onUnmarkPaid,
  }: {
    teamStatus: string;
    divisionId: number | null;
    divisions: TeamAdminDivision[];
    isFreeDivision: boolean;
    unpaidPlayers: TeamRosterPlayer[];
    paidPlayers: TeamRosterPlayer[];
    busy: boolean;
    onMarkPaid: (player: { steamId: string; name: string }) => void;
    onUnmarkPaid: (player: { steamId: string; name: string }) => void;
  } = $props();

  let adminStatus = $state('');
  let adminDivisionId = $state('');

  $effect(() => {
    adminStatus = teamStatus;
    adminDivisionId = divisionId != null ? String(divisionId) : '';
  });
</script>

<Card padding="md">
  {#snippet header()}
    <h2 class="text-sm font-semibold text-white">Admin controls</h2>
  {/snippet}

  <div class="space-y-8">
    <form method="POST" action="?/updateStatus" use:enhance class="max-w-lg">
      <FormSelect
        label="Team Status"
        name="status"
        bind:value={adminStatus}
        options={[
          { value: 'UNREADY', label: 'Unready' },
          { value: 'PENDING', label: 'Pending' },
          { value: 'READY', label: 'Ready' },
          { value: 'DEAD', label: 'Dead' },
          { value: 'PLACEMENT', label: 'Placement' },
        ]}
      />
      <Button type="submit" disabled={busy}>Update Status</Button>
    </form>

    <hr class="border-border-default" />

    {#if divisions.length > 0}
      <form method="POST" action="?/changeDivision" use:enhance class="max-w-lg">
        <FormSelect
          label="Division"
          name="divisionId"
          bind:value={adminDivisionId}
          options={divisions.map((division) => ({
            value: String(division.id),
            label: `${division.name}${division.signupCost > 0 ? ` ($${division.signupCost})` : ' (free)'}`,
          }))}
        />
        <Button type="submit" disabled={busy}>Update Division</Button>
      </form>
    {:else}
      <p class="text-sm text-text-muted">No divisions available for this team's region.</p>
    {/if}

    {#if !isFreeDivision && (unpaidPlayers.length > 0 || paidPlayers.length > 0)}
      <hr class="border-border-default" />
      <div class="space-y-8">
        {#if unpaidPlayers.length > 0}
          <div>
            <h3 class="mb-4 text-lg font-bold text-white">Mark Player as Paid</h3>
            <div class="space-y-2">
              {#each unpaidPlayers as player (player.steamId)}
                <div class="flex items-center justify-between rounded-lg bg-surface-page/50 p-3">
                  <div class="flex items-center gap-3">
                    <img
                      src={player.avatar || DEFAULT_AVATAR}
                      alt=""
                      class="size-8 rounded object-cover"
                    />
                    <span class="font-medium text-white">{player.name}</span>
                    <Badge color="red">Unpaid</Badge>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={busy}
                    onclick={() => onMarkPaid({ steamId: player.steamId, name: player.name })}
                  >
                    Mark as Paid
                  </Button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if paidPlayers.length > 0}
          <div>
            <h3 class="mb-4 text-lg font-bold text-white">Mark Player as Unpaid</h3>
            <div class="space-y-2">
              {#each paidPlayers as player (player.steamId)}
                <div class="flex items-center justify-between rounded-lg bg-surface-page/50 p-3">
                  <div class="flex items-center gap-3">
                    <img
                      src={player.avatar || DEFAULT_AVATAR}
                      alt=""
                      class="size-8 rounded object-cover"
                    />
                    <span class="font-medium text-white">{player.name}</span>
                    <Badge color="green">Paid</Badge>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onclick={() => onUnmarkPaid({ steamId: player.steamId, name: player.name })}
                  >
                    Mark as Unpaid
                  </Button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</Card>
