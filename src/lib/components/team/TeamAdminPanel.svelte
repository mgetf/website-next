<script lang="ts">
  import { enhance, type SubmitFunction } from '$app/forms';
  import { TF_CLASSES_DISPLAY_ORDER } from '#lib/constants/tfClasses.js';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import FormSelect from '#lib/components/ui/form/FormSelect.svelte';
  import type { TeamAdminDivision, TeamRosterPlayer } from '#lib/types/team.js';
  import { classIcon } from '#lib/utils/classIcons.js';

  const DEFAULT_AVATAR = '/default-avatar.png';

  let {
    teamStatus,
    divisionId,
    divisions,
    isFreeDivision,
    players,
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
    players: TeamRosterPlayer[];
    unpaidPlayers: TeamRosterPlayer[];
    paidPlayers: TeamRosterPlayer[];
    busy: boolean;
    onMarkPaid: (player: { steamId: string; name: string }) => void;
    onUnmarkPaid: (player: { steamId: string; name: string }) => void;
  } = $props();

  let adminStatus = $state('');
  let adminDivisionId = $state('');
  let selectedSteamId = $state('');
  let selectedClassIds = $state<number[]>([]);

  const playerOptions = $derived(
    players.map((player) => ({ value: player.steamId, label: player.name })),
  );
  const restrictedPlayers = $derived(
    players.filter((player) => player.restrictedClasses.length > 0),
  );

  $effect(() => {
    adminStatus = teamStatus;
    adminDivisionId = divisionId != null ? String(divisionId) : 'none';
  });

  function selectPlayer(steamId: string) {
    selectedSteamId = steamId;
    const player = players.find((entry) => entry.steamId === steamId);
    selectedClassIds = player?.restrictedClasses.map((tfClass) => tfClass.id) ?? [];
  }

  function toggleClass(id: number, event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    selectedClassIds = input.checked
      ? [...selectedClassIds, id]
      : selectedClassIds.filter((current) => current !== id);
  }

  const keepPlace: SubmitFunction = () => {
    return async ({ update }) => {
      await update({ navigate: false });
    };
  };
</script>

<Card padding="md">
  {#snippet header()}
    <h2 class="text-sm font-semibold text-white">Admin controls</h2>
  {/snippet}

  <div class="space-y-8">
    <form method="POST" action="?/updateStatus" use:enhance={keepPlace} class="max-w-lg">
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

    {#if divisions.length > 0 || divisionId != null}
      <form method="POST" action="?/changeDivision" use:enhance={keepPlace} class="max-w-lg">
        <FormSelect
          label="Division"
          name="divisionId"
          bind:value={adminDivisionId}
          options={[
            { value: 'none', label: 'Unplaced' },
            ...divisions.map((division) => ({
              value: String(division.id),
              label: `${division.name}${division.signupCost > 0 ? ` ($${division.signupCost})` : ' (free)'}`,
            })),
          ]}
        />
        <Button type="submit" disabled={busy}>Update Division</Button>
      </form>
    {:else}
      <p class="text-sm text-text-muted">No divisions available for this team's region.</p>
    {/if}

    <hr class="border-border-default" />

    <div>
      <h3 class="mb-2 text-lg font-bold text-white">Class restrictions</h3>
      <p class="mb-4 text-sm text-text-body">
        Choose the classes a player cannot play. The restriction shows on this team's page.
      </p>

      {#if restrictedPlayers.length > 0}
        <ul class="mb-4 space-y-2">
          {#each restrictedPlayers as player (player.steamId)}
            <li class="flex flex-wrap items-center gap-2 text-sm text-text-label">
              <span class="font-medium text-white">{player.name}</span>
              <span class="text-text-muted">cannot play</span>
              {#each player.restrictedClasses as tfClass (tfClass.id)}
                {@const icon = classIcon(tfClass.name)}
                <Badge color="yellow">
                  {#if icon}
                    <img src={icon} alt="" class="mr-1 size-4" />
                  {/if}
                  {tfClass.label}
                </Badge>
              {/each}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mb-4 text-sm text-text-muted">No class restrictions on this roster.</p>
      {/if}

      {#if players.length === 0}
        <p class="text-sm text-text-muted">No active players to restrict.</p>
      {:else}
        <form method="POST" action="?/setClassRestriction" use:enhance={keepPlace} class="max-w-lg">
          <FormSelect
            label="Player"
            name="playerSteamId"
            bind:value={selectedSteamId}
            onChange={selectPlayer}
            options={playerOptions}
            placeholder="Select a player"
            required
            disabled={busy}
          />
          <fieldset class="mb-6" disabled={!selectedSteamId || busy}>
            <legend class="mb-2 block text-sm font-medium text-text-label">
              Classes they cannot play
            </legend>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {#each TF_CLASSES_DISPLAY_ORDER as tfClass (tfClass.id)}
                {@const icon = classIcon(tfClass.name)}
                <label
                  class="flex items-center gap-2 rounded-lg border border-border-input bg-surface-input px-3 py-2 text-sm text-text-label"
                >
                  <input
                    type="checkbox"
                    name="classIds"
                    value={tfClass.id}
                    checked={selectedClassIds.includes(tfClass.id)}
                    onchange={(event) => toggleClass(tfClass.id, event)}
                  />
                  {#if icon}
                    <img src={icon} alt="" class="size-5" />
                  {/if}
                  {tfClass.label}
                </label>
              {/each}
            </div>
            <p class="mt-2 text-xs text-text-muted">
              Save with none checked to clear the restriction.
            </p>
          </fieldset>
          <Button type="submit" disabled={busy || !selectedSteamId}>Save restriction</Button>
        </form>
      {/if}
    </div>

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
