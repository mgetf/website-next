<script lang="ts">
  import type { BlogCommentNode } from '$lib/types/blogComment';
  import Card from '$lib/components/ui/Card.svelte';
  import CommentForm from './CommentForm.svelte';
  import CommentItem from './CommentItem.svelte';

  interface Props {
    postId: number;
    comments: BlogCommentNode[];
    isLoggedIn: boolean;
  }

  let { postId, comments, isLoggedIn }: Props = $props();

  function countAll(nodes: BlogCommentNode[]): number {
    return nodes.reduce((total, node) => total + 1 + countAll(node.replies), 0);
  }

  const commentCount = $derived(countAll(comments));
</script>

<Card padding="lg">
  <h2 class="text-xl font-bold text-white">
    {commentCount}
    {commentCount === 1 ? 'Comment' : 'Comments'}
  </h2>

  <div class="mt-4">
    {#if isLoggedIn}
      <CommentForm {postId} />
    {:else}
      <div
        class="rounded-lg border border-border-default bg-surface-input p-4 text-sm text-text-body"
      >
        <a href="/auth/login" class="font-semibold text-primary-400 hover:text-primary-300">
          Log in with your MGE.tf account
        </a>
        to join the discussion.
      </div>
    {/if}
  </div>

  {#if comments.length > 0}
    <div class="mt-4 divide-y divide-border-default">
      {#each comments as comment (comment.id)}
        <CommentItem {postId} {comment} {isLoggedIn} />
      {/each}
    </div>
  {:else}
    <p class="mt-6 text-sm text-text-muted">Be the first to leave a comment.</p>
  {/if}
</Card>
