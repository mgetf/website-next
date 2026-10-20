<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import DataTable, { type Column } from '#lib/components/ui/DataTable.svelte';
  import Dialog from '#lib/components/ui/Dialog.svelte';
  import FormInput from '#lib/components/ui/form/FormInput.svelte';
  import SeasonScope from '#lib/components/ui/SeasonScope.svelte';
  import type { ProfilePaymentEntry } from '#lib/types/profile.js';
  import { toast } from '#lib/state/toast.svelte.js';
  import FileText from '~icons/lucide/file-text';
  import Receipt from '~icons/lucide/receipt';
  import Undo2 from '~icons/lucide/undo-2';

  interface RefundQuoteView {
    gross: number | null;
    fee: number | null;
    net: number | null;
    currency: string | null;
    itemName: string | null;
    itemQuantity: number | null;
    blockReason: string | null;
  }

  let {
    steamId,
    entries,
    covered = [],
    total,
    currentPage,
    totalPages,
    isAdmin = false,
    isOwnProfile = false,
    hasTradeOfferUrl = false,
    tradeOfferUrl = null,
  }: {
    steamId: string;
    entries: ProfilePaymentEntry[];
    covered?: ProfilePaymentEntry[];
    total: number;
    currentPage: number;
    totalPages: number;
    isAdmin?: boolean;
    isOwnProfile?: boolean;
    hasTradeOfferUrl?: boolean;
    tradeOfferUrl?: string | null;
  } = $props();

  let open = $state(false);
  let selected = $state<ProfilePaymentEntry | null>(null);
  let reason = $state('');
  let markUnpaid = $state(false);
  let removeFromTeam = $state(false);
  let quote = $state<RefundQuoteView | null>(null);
  let quoteError = $state('');
  let quoting = $state(false);
  let submitting = $state(false);

  const columns = $derived<Column[]>([
    { key: 'date', label: 'Date', width: '9.5rem' },
    { key: 'method', label: 'Method', width: '8rem' },
    { key: 'amount', label: 'Amount', width: '8rem' },
    { key: 'covered', label: 'For', width: '8rem' },
    { key: 'team', label: 'Team', width: '13rem' },
    { key: 'status', label: 'Status', width: '8.5rem' },
    { key: 'actions', label: 'Actions', align: 'right' as const, width: '22rem' },
  ]);

  const coveredColumns = $derived<Column[]>([
    { key: 'date', label: 'Date', width: '9.5rem' },
    { key: 'payer', label: 'Paid by' },
    { key: 'amount', label: 'Amount', width: '8rem' },
    { key: 'team', label: 'Team', width: '13rem' },
    { key: 'status', label: 'Status', width: '8.5rem' },
    { key: 'actions', label: 'Actions', align: 'right' as const, width: '22rem' },
  ]);

  const iconBtnClass = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap';

  const profilePath = $derived(resolve('/users/[steamId]', { steamId }));
  const canSubmit = $derived(
    !quoting && !submitting && !quoteError && !quote?.blockReason && reason.trim().length >= 3,
  );

  function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusColor(
    status: ProfilePaymentEntry['status'],
  ): 'green' | 'yellow' | 'red' | 'zinc' | 'purple' {
    if (status === 'completed') return 'green';
    if (status === 'pending' || status === 'refund_pending') return 'yellow';
    if (status === 'expired') return 'red';
    if (status === 'refunded') return 'purple';
    return 'zinc';
  }

  function statusLabel(status: ProfilePaymentEntry['status']): string {
    if (status === 'completed') return 'Completed';
    if (status === 'pending') return 'Pending';
    if (status === 'expired') return 'Expired';
    if (status === 'refunded') return 'Refunded';
    if (status === 'refund_pending') return 'Refund pending';
    return 'Cancelled';
  }

  function money(amount: number | null, currency: string | null): string {
    if (amount == null) return '-';
    const symbol = currency === 'EUR' ? '€' : '$';
    return `${symbol}${amount.toFixed(2)} ${currency ?? 'USD'}`;
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(page.url.searchParams.toString());
    params.set('tab', 'payments');
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const search = params.toString();
    void goto(search ? `${profilePath}?${search}` : profilePath, {
      reset: false,
    });
  }

  async function openRefund(entry: ProfilePaymentEntry) {
    selected = entry;
    reason = '';
    markUnpaid = false;
    removeFromTeam = false;
    quote = null;
    quoteError = '';
    open = true;
    quoting = true;
    try {
      const params = new URLSearchParams({
        steamId,
        sourceId: entry.id,
        method: entry.method,
      });
      const response = await fetch(`/api/payments/refund-quote?${params}`);
      const body = (await response.json()) as RefundQuoteView & { message?: string };
      if (!response.ok) quoteError = body.message ?? 'Could not load the refund.';
      else quote = body;
    } catch {
      quoteError = 'Could not load the refund.';
    } finally {
      quoting = false;
    }
  }

  function closeRefund() {
    if (submitting) return;
    open = false;
  }
</script>

<div class="flex flex-col gap-4">
  <p class="text-sm text-text-body">PayPal charges, Steam item trades, and manual marks.</p>

  {#if isOwnProfile}
    <form
      method="POST"
      action="?/saveTradeOfferUrl"
      class="flex flex-col gap-1"
      use:enhance={() => {
        return async ({ result, update }) => {
          if (result.type === 'success') {
            const message = (result.data as { message?: string } | undefined)?.message;
            toast.success(message ?? 'Trade offer link saved.');
            await update();
          } else if (result.type === 'failure') {
            toast.error(
              (result.data as { error?: string } | undefined)?.error ?? 'Could not save the link.',
            );
          }
        };
      }}
    >
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <FormInput
            label="Steam trade offer link"
            name="tradeOfferUrl"
            type="url"
            value={tradeOfferUrl ?? ''}
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
            compact
          />
        </div>
        <Button type="submit" variant="primary" size="sm" class="shrink-0">Save link</Button>
      </div>
      <p class="text-xs text-text-muted">
        Needed for item refunds. Leave blank to remove it.
        <a
          href="http://steamcommunity.com/my/tradeoffers/privacy#footer_spacer"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary-ink hover:text-primary-300 hover:underline"
        >
          Get my trade link
        </a>
      </p>
    </form>
  {:else if isAdmin}
    <p class="text-sm text-text-body">
      Trade offer link: {hasTradeOfferUrl ? 'saved' : 'not saved'}
    </p>
  {/if}

  {#snippet paymentActions(entry: ProfilePaymentEntry, includeGroupReceipt: boolean)}
    <div class="flex flex-nowrap justify-end gap-2">
      {#if entry.invoiceNumber}
        <Button
          href="/invoices/{entry.invoiceNumber}"
          variant="secondary"
          size="sm"
          class={iconBtnClass}
        >
          <FileText class="size-3.5" />
          Invoice
        </Button>
      {/if}
      {#if includeGroupReceipt && entry.groupInvoiceNumber && entry.groupInvoiceNumber !== entry.invoiceNumber}
        <Button
          href="/invoices/{entry.groupInvoiceNumber}"
          variant="secondary"
          size="sm"
          class={iconBtnClass}
        >
          <Receipt class="size-3.5" />
          Receipt
        </Button>
      {/if}
      {#if entry.creditNoteNumber}
        <Button
          href="/invoices/{entry.creditNoteNumber}"
          variant="secondary"
          size="sm"
          class={iconBtnClass}
        >
          <FileText class="size-3.5" />
          Credit note
        </Button>
      {/if}
      {#if isAdmin && entry.refundable}
        <Button
          type="button"
          variant="danger"
          size="sm"
          class={iconBtnClass}
          onclick={() => openRefund(entry)}
        >
          <Undo2 class="size-3.5" />
          Refund
        </Button>
      {/if}
    </div>
  {/snippet}

  <DataTable
    data={entries}
    {columns}
    emptyMessage="No payment history found"
    pagination={totalPages > 1
      ? {
          currentPage,
          totalPages,
          onPageChange: goToPage,
          infoText: `Page ${currentPage} of ${totalPages} (${total} total)`,
        }
      : undefined}
  >
    {#snippet cell(entry, col)}
      {#if col.key === 'date'}
        <span class="block text-text-body">{formatDay(entry.date)}</span>
        <span class="block text-xs text-text-muted">{formatTime(entry.date)}</span>
      {:else if col.key === 'method'}
        <span class="inline-flex items-center gap-2 whitespace-nowrap text-text-heading">
          {#if entry.method === 'paypal'}
            <img src="/paypal.svg" alt="" class="h-4 w-4 shrink-0 object-contain" />
            PayPal
          {:else if entry.method === 'items'}
            <img
              src="/steam_logo.png"
              alt=""
              class="h-4 w-4 shrink-0 object-contain brightness-0 invert"
            />
            Steam
          {:else}
            Manual
          {/if}
        </span>
      {:else if col.key === 'amount'}
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            {#if entry.method === 'paypal'}
              <img src="/paypal.svg" alt="" class="h-5 w-4 shrink-0 object-contain" />
            {:else if entry.iconUrl}
              <img src={entry.iconUrl} alt="" class="h-6 w-6 shrink-0 object-contain" />
            {/if}
            <span class="font-medium whitespace-nowrap text-text-heading">{entry.amountLabel}</span>
          </div>
          <p class="truncate font-mono text-xs text-text-muted" title={entry.id}>{entry.id}</p>
        </div>
      {:else if col.key === 'team'}
        {#if entry.teamId}
          <div class="flex min-w-0 flex-col gap-px leading-tight">
            <a
              href={resolve('/teams/[id]', { id: String(entry.teamId) })}
              class="truncate text-primary-ink transition-colors hover:text-primary-300"
              title={entry.teamName ?? ''}
            >
              {entry.teamName}
            </a>
            <SeasonScope
              region={entry.regionName}
              seasonNum={entry.seasonNum}
              division={entry.division}
              formatName={entry.formatName}
              class="text-xs"
            />
          </div>
        {:else}
          <span class="text-text-muted">-</span>
        {/if}
      {:else if col.key === 'status'}
        <Badge color={statusColor(entry.status)}>
          {statusLabel(entry.status)}
        </Badge>
      {:else if col.key === 'actions'}
        {@render paymentActions(entry, true)}
      {:else if col.key === 'covered'}
        <span class="text-sm text-text-body">{entry.coveredName ?? '—'}</span>
      {/if}
    {/snippet}
  </DataTable>

  {#if covered.length > 0}
    <h3 class="mt-4 text-sm font-semibold text-text-heading">Participations covered</h3>
    <p class="text-sm text-text-body">
      Signup fees someone else paid for this player. The receipt lives on the payer&apos;s profile.
    </p>
    <DataTable data={covered} columns={coveredColumns} emptyMessage="No covered participations">
      {#snippet cell(entry, col)}
        {#if col.key === 'date'}
          <span class="block text-text-body">{formatDay(entry.date)}</span>
          <span class="block text-xs text-text-muted">{formatTime(entry.date)}</span>
        {:else if col.key === 'payer'}
          {#if entry.payerHistoryHref}
            <a
              href={entry.payerHistoryHref}
              class="text-sm text-primary-ink hover:text-primary-300"
            >
              {entry.payerName ?? 'View payment'}
            </a>
          {:else}
            <span class="text-sm text-text-body">{entry.payerName ?? '—'}</span>
          {/if}
        {:else if col.key === 'amount'}
          <span class="font-medium whitespace-nowrap text-text-heading">{entry.amountLabel}</span>
        {:else if col.key === 'team'}
          {#if entry.teamId}
            <a
              href={resolve('/teams/[id]', { id: String(entry.teamId) })}
              class="text-primary-ink hover:text-primary-300"
            >
              {entry.teamName}
            </a>
          {:else}
            <span class="text-text-muted">-</span>
          {/if}
        {:else if col.key === 'status'}
          <Badge color={statusColor(entry.status)}>{statusLabel(entry.status)}</Badge>
        {:else if col.key === 'actions'}
          {@render paymentActions(entry, false)}
        {/if}
      {/snippet}
    </DataTable>
  {/if}
</div>

<Dialog {open} title="Refund payment" onClose={closeRefund}>
  {#if selected}
    <form
      method="POST"
      action="?/refundPayment"
      class="flex flex-col gap-4"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            toast.success(
              (result.data as { message?: string } | undefined)?.message ?? 'Refund recorded.',
            );
            open = false;
            await update();
          } else if (result.type === 'failure') {
            toast.error((result.data as { error?: string } | undefined)?.error ?? 'Refund failed.');
          }
        };
      }}
    >
      <input type="hidden" name="sourceId" value={selected.id} />
      <input type="hidden" name="method" value={selected.method} />
      <p class="text-sm text-text-body">{selected.description}</p>

      {#if quoting}
        <p class="text-sm text-text-muted">Checking what can be returned…</p>
      {:else if quoteError}
        <p class="text-sm text-danger-ink">{quoteError}</p>
      {:else if quote?.blockReason}
        <p class="text-sm text-danger-ink">{quote.blockReason}</p>
      {:else if selected.method === 'paypal' && quote}
        <p class="text-sm text-text-body">
          Charged {money(quote.gross, quote.currency)}. PayPal keeps {money(
            quote.fee,
            quote.currency,
          )}. The player receives {money(quote.net, quote.currency)}.
        </p>
      {:else if selected.method === 'items' && quote}
        <p class="text-sm text-text-body">
          The bot will offer {quote.itemQuantity}x {quote.itemName}. The player still has to accept
          the trade.
        </p>
      {/if}

      <label class="flex flex-col gap-1 text-sm text-text-label" for="refund-reason">
        Reason
        <textarea
          id="refund-reason"
          name="reason"
          bind:value={reason}
          required
          minlength="3"
          maxlength="500"
          rows="3"
          class="w-full rounded-lg border border-border-input bg-surface-input px-3 py-2 text-text-heading focus:outline-none focus:ring-2 focus:ring-primary-500"
        ></textarea>
      </label>

      <label class="flex items-center gap-2 text-sm text-text-body">
        <input type="checkbox" name="markUnpaid" value="1" bind:checked={markUnpaid} />
        Mark them unpaid on this team
      </label>
      {#if selected.canRemoveFromTeam}
        <label class="flex items-center gap-2 text-sm text-text-body">
          <input type="checkbox" name="removeFromTeam" value="1" bind:checked={removeFromTeam} />
          Remove them from the team
        </label>
      {:else}
        <p class="text-xs text-text-muted">
          The team leader cannot be removed. The refund can still go through.
        </p>
      {/if}

      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" onclick={closeRefund} disabled={submitting}
          >Cancel</Button
        >
        <Button type="submit" variant="danger" disabled={!canSubmit}>
          {submitting ? 'Working…' : 'Confirm refund'}
        </Button>
      </div>
    </form>
  {/if}
</Dialog>
