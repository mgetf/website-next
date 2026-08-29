<script lang="ts">
  import { enhance } from '$app/forms';
  import type { BlogCommentNode } from '$lib/types/blogComment';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import CommentForm from './CommentForm.svelte';
  import CommentItem from './CommentItem.svelte';
  import LikeButton from './LikeButton.svelte';
  import { formatDateTime } from '$lib/utils/datetime';

  const MAX_VISUAL_DEPTH = 6;

  interface Props {
    comment: BlogCommentNode;
    postId: number;
    isLoggedIn: boolean;
    depth?: number;
  }

  let { comment, postId, isLoggedIn, depth = 0 }: Props = $props();

  let showReplyForm = $state(false);
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);
  let deleteFormEl: HTMLFormElement | undefined = $state();

  const visualDepth = $derived(Math.min(depth, MAX_VISUAL_DEPTH));
</script>

<div class={visualDepth > 0 ? 'border-l border-border-default pl-4 md:pl-6 ml-2 md:ml-3' : ''}>
  <div class="py-4">
    <div class="flex items-start gap-3">
      {#if comment.author}
        <a href="/users/{comment.author.steamId}" class="flex-shrink-0">
          <img
            src={comment.author.avatar || '/default-avatar.png'}
            alt={comment.author.name}
            class="h-9 w-9 rounded-full"
          />
        </a>
      {:else}
        <div class="h-9 w-9 flex-shrink-0 rounded-full bg-surface-hover"></div>
      {/if}

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          {#if comment.author}
            <a
              href="/users/{comment.author.steamId}"
              class="text-sm font-semibold text-white hover:text-primary-400"
            >
              {comment.author.name}
            </a>
          {:else}
            <span class="text-sm font-semibold italic text-text-muted">[deleted]</span>
          {/if}
          {#if comment.isOP}
            <Badge color="orange" size="sm">OP</Badge>
          {/if}
          <span class="text-xs text-text-muted">{formatDateTime(comment.createdAt)}</span>
        </div>

        <p class="mt-1 whitespace-pre-wrap break-words text-sm text-text-label">
          {comment.content}
        </p>

        <div class="mt-1 flex items-center gap-3">
          {#if !comment.deleted}
            <LikeButton
              action="?/toggleCommentLike"
              fieldName="commentId"
              fieldValue={comment.id}
              likeCount={comment.likeCount}
              likedByMe={comment.likedByMe}
              {isLoggedIn}
              compact
            />
          {/if}
          {#if isLoggedIn && !comment.deleted}
            <button
              type="button"
              class="text-xs font-medium text-text-muted transition-colors hover:text-white"
              onclick={() => (showReplyForm = !showReplyForm)}
            >
              Reply
            </button>
          {/if}
          {#if comment.canDelete}
            <button
              type="button"
              class="text-xs font-medium text-text-muted transition-colors hover:text-danger-400"
              onclick={() => (showDeleteConfirm = true)}
            >
              Delete
            </button>
          {/if}
        </div>

        {#if showReplyForm}
          <div class="mt-3">
            <CommentForm
              {postId}
              parentId={comment.id}
              placeholder="Write a reply..."
              submitLabel="Reply"
              onCancel={() => (showReplyForm = false)}
              onSuccess={() => (showReplyForm = false)}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if comment.replies.length > 0}
    <div>
      {#each comment.replies as reply (reply.id)}
        <CommentItem {postId} comment={reply} {isLoggedIn} depth={depth + 1} />
      {/each}
    </div>
  {/if}
</div>

<form
  bind:this={deleteFormEl}
  method="POST"
  action="?/deleteComment"
  use:enhance={() => {
    deleting = true;
    return async ({ update }) => {
      await update();
      deleting = false;
      showDeleteConfirm = false;
    };
  }}
  class="hidden"
>
  <input type="hidden" name="commentId" value={comment.id} />
</form>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Comment"
  description="Are you sure you want to delete this comment? This cannot be undone."
  confirmLabel="Delete"
  loadingLabel="Deleting..."
  variant="danger"
  isLoading={deleting}
  onConfirm={() => deleteFormEl?.requestSubmit()}
  onCancel={() => (showDeleteConfirm = false)}
/>
