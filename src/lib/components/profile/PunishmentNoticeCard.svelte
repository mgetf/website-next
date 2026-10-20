<script lang="ts">
  import Badge from '#lib/components/ui/Badge.svelte';
  import type { PunishmentNotice } from '#lib/types/punishment.js';
  import {
    displayPunishmentReason,
    formatPunishmentEndCopy,
    punishmentStatusLabel,
  } from '#lib/utils/punishment.js';

  let {
    notice,
    variant = 'card',
  }: {
    notice: PunishmentNotice;
    variant?: 'card' | 'banner';
  } = $props();

  const badgeColor = $derived<'red' | 'orange' | 'yellow'>(
    notice.status === 'BANNED' ? 'red' : notice.status === 'SUSPENDED' ? 'orange' : 'yellow',
  );
  const label = $derived(punishmentStatusLabel(notice.status));
  const reason = $derived(displayPunishmentReason(notice.reason));
  const endCopy = $derived(formatPunishmentEndCopy(notice.endsAt));
</script>

{#if variant === 'banner'}
  <div class="border-b border-danger-500/40 bg-danger-600/15 px-4 py-2.5 text-center">
    <p class="text-sm text-danger-ink">
      <span class="font-semibold">Your account is {label}.</span>
      {reason}
      <span class="text-text-muted"> {endCopy}</span>
    </p>
  </div>
{:else}
  <div class="rounded-lg border border-danger-500/30 bg-danger-500/10 p-3">
    <div class="mb-2 flex items-center gap-2">
      <Badge color={badgeColor}>{label}</Badge>
      {#if notice.durationDays}
        <span class="text-xs text-text-muted">{notice.durationDays} days</span>
      {/if}
    </div>
    <p class="text-sm text-text-label">{reason}</p>
    <p class="mt-1 text-xs text-text-muted">{endCopy}</p>
  </div>
{/if}
