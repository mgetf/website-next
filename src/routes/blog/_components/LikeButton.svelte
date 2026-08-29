<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    action: string;
    fieldName: string;
    fieldValue: string | number;
    likeCount: number;
    likedByMe: boolean;
    isLoggedIn: boolean;
    compact?: boolean;
  }

  let {
    action,
    fieldName,
    fieldValue,
    likeCount,
    likedByMe,
    isLoggedIn,
    compact = false,
  }: Props = $props();

  let overrideLiked = $state<boolean | null>(null);
  let overrideCount = $state<number | null>(null);
  let pending = $state(false);

  const liked = $derived(overrideLiked ?? likedByMe);
  const count = $derived(overrideCount ?? likeCount);
  const label = $derived(liked ? 'Unlike' : 'Like');
  const iconSize = $derived(compact ? 'h-3.5 w-3.5' : 'h-4 w-4');

  const compactClass = $derived(
    liked
      ? 'inline-flex items-center gap-1 text-xs font-medium text-primary-400 transition-colors'
      : 'inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-white',
  );
</script>

{#snippet heart()}
  <svg
    class="shrink-0 {iconSize} {liked ? 'text-primary-400' : ''}"
    fill={liked ? 'currentColor' : 'none'}
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
    />
  </svg>
{/snippet}

{#if !isLoggedIn}
  {#if compact}
    <a href="/auth/login" class={compactClass} aria-label="Like">
      {@render heart()}
      {count}
    </a>
  {:else}
    <Button
      href="/auth/login"
      variant="ghost"
      size="sm"
      aria-label="Like"
      class="inline-flex items-center gap-1.5"
    >
      {@render heart()}
      {count}
    </Button>
  {/if}
{:else}
  <form
    method="POST"
    {action}
    use:enhance={() => {
      const prevLiked = liked;
      const prevCount = count;
      pending = true;
      overrideLiked = !prevLiked;
      overrideCount = !prevLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

      return async ({ result, update }) => {
        if (result.type === 'success') {
          const payload = result.data as
            { data?: { liked: boolean; likeCount: number } } | undefined;
          if (payload?.data) {
            overrideLiked = payload.data.liked;
            overrideCount = payload.data.likeCount;
          }
        } else {
          overrideLiked = prevLiked;
          overrideCount = prevCount;
        }
        await update({ reset: false });
        overrideLiked = null;
        overrideCount = null;
        pending = false;
      };
    }}
    class="inline"
  >
    <input type="hidden" name={fieldName} value={fieldValue} />
    {#if compact}
      <button
        type="submit"
        class={compactClass}
        aria-pressed={liked}
        aria-label={label}
        disabled={pending}
      >
        {@render heart()}
        {count}
      </button>
    {:else}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        class="inline-flex items-center gap-1.5{liked ? ' text-primary-400' : ''}"
        aria-pressed={liked}
        aria-label={label}
        disabled={pending}
      >
        {@render heart()}
        {count}
      </Button>
    {/if}
  </form>
{/if}
