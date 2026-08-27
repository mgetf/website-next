<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    postId: number;
    parentId?: number;
    placeholder?: string;
    submitLabel?: string;
    onCancel?: () => void;
    onSuccess?: () => void;
  }

  let {
    postId,
    parentId,
    placeholder = 'Share your thoughts...',
    submitLabel = 'Post comment',
    onCancel,
    onSuccess,
  }: Props = $props();

  const MAX_LENGTH = 2000;

  let content = $state('');
  let submitting = $state(false);
  let errorMessage = $state('');
  let formEl: HTMLFormElement | undefined = $state();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formEl?.requestSubmit();
    }
  }
</script>

<form
  bind:this={formEl}
  method="POST"
  action="?/addComment"
  use:enhance={() => {
    submitting = true;
    errorMessage = '';
    return async ({ result, update }) => {
      submitting = false;
      if (result.type === 'failure') {
        errorMessage = (result.data?.error as string | undefined) ?? 'Failed to post comment';
        await update({ reset: false });
        return;
      }
      if (result.type === 'success') {
        content = '';
      }
      await update();
      if (result.type === 'success') onSuccess?.();
    };
  }}
  class="space-y-2"
>
  <input type="hidden" name="postId" value={postId} />
  {#if parentId}
    <input type="hidden" name="parentId" value={parentId} />
  {/if}
  <textarea
    name="content"
    bind:value={content}
    onkeydown={handleKeydown}
    rows={parentId ? 2 : 3}
    maxlength={MAX_LENGTH}
    required
    {placeholder}
    class="w-full resize-none rounded-lg border border-border-input bg-surface-input px-4 py-3 text-white placeholder-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
  ></textarea>

  {#if errorMessage}
    <p class="text-sm text-danger-400">{errorMessage}</p>
  {/if}

  <div class="flex items-center justify-between gap-2">
    <span class="text-xs text-text-muted">
      {content.length}/{MAX_LENGTH} · Ctrl+Enter to send
    </span>
    <div class="flex gap-2">
      {#if onCancel}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onclick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      {/if}
      <Button type="submit" variant="primary" size="sm" disabled={submitting || !content.trim()}>
        {submitting ? 'Posting...' : submitLabel}
      </Button>
    </div>
  </div>
</form>
