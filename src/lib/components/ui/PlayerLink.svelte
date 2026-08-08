<script lang="ts">
  interface Props {
    steamId?: string | null;
    name: string;
    avatar?: string | null;
    flagEmoji?: string | null;
    size?: 'sm' | 'md' | 'lg';
    showAvatar?: boolean;
    href?: string | null;
    class?: string;
    avatarClass?: string;
    nameClass?: string;
  }

  let {
    steamId = null,
    name,
    avatar = null,
    flagEmoji = null,
    size = 'md',
    showAvatar = true,
    href = undefined,
    class: className = '',
    avatarClass = '',
    nameClass = '',
  }: Props = $props();

  const avatarSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  } as const;

  const gapSizes = {
    sm: 'gap-1.5',
    md: 'gap-2',
    lg: 'gap-3',
  } as const;

  const resolvedHref = $derived(
    href === null ? null : (href ?? (steamId ? `/users/${steamId}` : null)),
  );

  const contentClass = $derived(
    `inline-flex items-center ${gapSizes[size]} min-w-0 ${className}`.trim(),
  );
</script>

{#snippet content()}
  {#if showAvatar}
    <img
      src={avatar || '/default-avatar.png'}
      alt=""
      class="{avatarSizes[size]} rounded object-cover shrink-0 {avatarClass}"
    />
  {/if}
  {#if flagEmoji}
    <span class="shrink-0 leading-none" title={flagEmoji} aria-hidden="true">{flagEmoji}</span>
  {/if}
  <span class="truncate {nameClass}">{name}</span>
{/snippet}

{#if resolvedHref}
  <a href={resolvedHref} class="{contentClass} group">
    {@render content()}
  </a>
{:else}
  <span class={contentClass}>
    {@render content()}
  </span>
{/if}
