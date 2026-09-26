<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import SeasonScope from '$lib/components/ui/SeasonScope.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import type { Profile1v1Entry } from '$lib/types/profile';
  import { statusColor, statusLabel, winPct } from '$lib/utils/profile';

  let {
    steamId,
    isOwn,
    isStaff,
    entry,
    divisions,
    idPrefix = 'profile-1v1',
    onReady,
    onWithdraw,
    onUpdateStatus,
    onUpdateDivision,
    onMarkPaid,
    onUnmarkPaid,
  }: {
    steamId: string;
    isOwn: boolean;
    isStaff: boolean;
    entry: Profile1v1Entry | null;
    divisions: { id: number; name: string; signupCost: number; regionId: number }[];
    idPrefix?: string;
    onReady: () => void;
    onWithdraw: () => void;
    onUpdateStatus: (status: string) => void;
    onUpdateDivision: (divisionId: string) => void;
    onMarkPaid: () => void;
    onUnmarkPaid: () => void;
  } = $props();

  let adminStatus = $state('');
  let adminDivisionId = $state('');
  $effect(() => {
    adminStatus = entry?.status ?? '';
    adminDivisionId = entry?.divisionId != null ? String(entry.divisionId) : '';
  });

  const canReady = $derived(
    entry !== null && entry.status === 'UNREADY' && (entry.isPaid || entry.signupCost === 0),
  );
  const needsPayment = $derived(entry !== null && entry.signupCost > 0 && !entry.isPaid);
  const canUnmarkPaid = $derived(
    entry !== null && entry.signupCost > 0 && entry.paymentStatus === 1,
  );
</script>

<div class="space-y-6">
  {#if !entry}
    <Card>
      <div class="py-6 text-center">
        <h2 class="text-lg font-semibold text-white">No active 1v1 entry</h2>
        <p class="mt-2 text-sm text-text-body">
          Signup and ready-up live here. Team-league roster work stays on the team page.
        </p>
        {#if isOwn}
          <div class="mt-4">
            <Button href="/leagues/1v1" variant="format-1v1">Browse 1v1 league</Button>
          </div>
        {/if}
      </div>
    </Card>
  {:else}
    <Card padding="none" class="overflow-hidden border-format-1v1-500/30">
      {#snippet header()}
        <div class="flex items-center justify-between px-5 py-3">
          <div>
            <h2 class="text-sm font-semibold text-white">Current entry</h2>
            <p class="mt-1 text-sm">
              <SeasonScope
                region={entry.region}
                seasonNum={entry.seasonNum}
                division={entry.division}
              />
            </p>
          </div>
          <Badge color={statusColor(entry.status)}>{statusLabel(entry.status)}</Badge>
        </div>
      {/snippet}
      <div class="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
        <div>
          <p class="text-xs text-text-muted">Record</p>
          <p class="mt-1 font-mono text-lg text-white">{entry.wins}–{entry.losses}</p>
        </div>
        <div>
          <p class="text-xs text-text-muted">Win rate</p>
          <p class="mt-1 text-lg text-white">{winPct(entry.wins, entry.losses)}%</p>
        </div>
        <div>
          <p class="text-xs text-text-muted">Payment</p>
          <p
            class="mt-1 text-lg {entry.isPaid || entry.signupCost === 0
              ? 'text-success-400'
              : 'text-warning-400'}"
          >
            {entry.signupCost === 0 ? 'Free' : entry.isPaid ? 'Paid' : `$${entry.signupCost} due`}
          </p>
        </div>
        <div>
          <p class="text-xs text-text-muted">Status</p>
          <p class="mt-1 text-lg text-white">{statusLabel(entry.status)}</p>
        </div>
      </div>
    </Card>

    {#if isOwn}
      <Card>
        {#snippet header()}
          <h2 class="text-sm font-semibold text-white">Your actions</h2>
        {/snippet}

        {#if entry.status === 'UNREADY'}
          <div class="space-y-4">
            {#if entry.signupCost > 0}
              <div
                class="rounded-lg border p-4 {entry.isPaid
                  ? 'border-success-500/30 bg-success-500/5'
                  : 'border-warning-500/30 bg-warning-500/5'}"
              >
                <div class="mb-2 flex items-center gap-3">
                  <span
                    class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white {entry.isPaid
                      ? 'bg-success-600'
                      : 'bg-warning-600'}"
                  >
                    1
                  </span>
                  <h3 class="text-base font-bold text-white">Pay signup fee</h3>
                  <span
                    class="ml-auto text-sm font-medium {entry.isPaid
                      ? 'text-success-400'
                      : 'text-warning-400'}"
                  >
                    {entry.isPaid ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
                {#if !entry.isPaid}
                  <div class="ml-10 space-y-3">
                    <p class="text-sm text-text-body">Pay the fee to unlock ready-up.</p>
                    <Button variant="warning" href="/checkout/{steamId}">Go to checkout</Button>
                  </div>
                {/if}
              </div>
            {/if}

            <div
              class="rounded-lg border p-4 {canReady
                ? 'border-primary-500/30 bg-primary-500/5'
                : 'border-border-default bg-surface-page/30'}"
            >
              <div class="mb-2 flex items-center gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white {canReady
                    ? 'bg-primary-600'
                    : 'bg-surface-input'}"
                >
                  {entry.signupCost > 0 ? '2' : '1'}
                </span>
                <h3 class="text-base font-bold {canReady ? 'text-white' : 'text-text-muted'}">
                  Ready up
                </h3>
              </div>
              <div class="ml-10">
                {#if canReady}
                  <p class="mb-3 text-sm text-text-body">
                    Staff will review the entry after you ready up.
                  </p>
                  <Button variant="primary" onclick={onReady}>Ready up</Button>
                {:else if needsPayment}
                  <p class="text-sm text-text-muted">Available after the signup fee is paid.</p>
                {/if}
              </div>
            </div>
          </div>
        {:else if entry.status === 'PENDING'}
          <div class="rounded-lg border border-warning-500/30 bg-warning-500/5 p-4">
            <div class="flex items-center gap-2">
              <span class="size-2 animate-pulse rounded-full bg-warning-400"></span>
              <span class="font-semibold text-warning-400">Pending staff approval</span>
            </div>
            <p class="mt-2 text-sm text-text-body">
              The entry is marked ready and waiting for review. You can still withdraw.
            </p>
          </div>
        {:else}
          <p class="text-sm text-text-body">
            This entry is in the season. Withdraw only if you need to leave the league.
          </p>
        {/if}

        <div class="mt-6">
          <Button variant="danger" onclick={onWithdraw}>Withdraw from league</Button>
        </div>
      </Card>
    {:else if !isStaff}
      <Card>
        <p class="text-sm text-text-body">
          Only this player can ready up or withdraw. Staff tools stay on the staff-only card when
          you have access.
        </p>
      </Card>
    {/if}

    {#if isStaff}
      <Card class="border-warning-500/40">
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white">League controls</h2>
            <Badge color="yellow">Staff only</Badge>
          </div>
        {/snippet}

        <form
          class="flex flex-col gap-3 sm:flex-row sm:items-end"
          onsubmit={(e) => {
            e.preventDefault();
            onUpdateStatus(adminStatus);
          }}
        >
          <div class="min-w-0 flex-1">
            <FormSelect
              label="Status"
              name="status"
              id="{idPrefix}-status"
              bind:value={adminStatus}
              options={[
                { value: 'UNREADY', label: 'Unready' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'READY', label: 'Ready' },
                { value: 'DEAD', label: 'Withdrawn' },
              ]}
            />
          </div>
          <Button type="submit" class="mb-6">Update status</Button>
        </form>

        {#if divisions.length > 0}
          <form
            class="flex flex-col gap-3 border-t border-border-default pt-2 sm:flex-row sm:items-end"
            onsubmit={(e) => {
              e.preventDefault();
              onUpdateDivision(adminDivisionId);
            }}
          >
            <div class="min-w-0 flex-1">
              <FormSelect
                label="Division"
                name="divisionId"
                id="{idPrefix}-division"
                bind:value={adminDivisionId}
                options={divisions.map((division) => ({
                  value: String(division.id),
                  label: `${division.name}${division.signupCost > 0 ? ` ($${division.signupCost})` : ' (free)'}`,
                }))}
              />
            </div>
            <Button type="submit" class="mb-6">Update division</Button>
          </form>
        {/if}

        {#if needsPayment}
          <div class="border-t border-border-default pt-4">
            <h3 class="mb-3 text-sm font-semibold text-white">Mark as paid</h3>
            <div class="flex items-center justify-between rounded-lg bg-surface-page/50 p-3">
              <Badge color="red">Unpaid</Badge>
              <Button variant="success" size="sm" onclick={onMarkPaid}>Mark as paid</Button>
            </div>
          </div>
        {:else if canUnmarkPaid}
          <div class="border-t border-border-default pt-4">
            <h3 class="mb-3 text-sm font-semibold text-white">Mark as unpaid</h3>
            <div class="flex items-center justify-between rounded-lg bg-surface-page/50 p-3">
              <Badge color="green">Paid</Badge>
              <Button variant="danger" size="sm" onclick={onUnmarkPaid}>Mark as unpaid</Button>
            </div>
          </div>
        {/if}
      </Card>
    {/if}
  {/if}
</div>
