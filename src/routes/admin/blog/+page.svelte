<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { formatDateTime } from '$lib/utils/datetime';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type PostRow = PageData['posts'][number];

  const columns: Column[] = [
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status', align: 'center', width: '120px' },
    { key: 'author', label: 'Author', width: '180px' },
    { key: 'updated', label: 'Updated', width: '180px' },
    { key: 'actions', label: 'Actions', align: 'right', srOnly: true },
  ];

  let lastFormResult: ActionData = null;
  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  let deletingPost: PostRow | null = $state(null);
  let deleteForm: HTMLFormElement | undefined = $state();
  let isSubmitting = $state(false);
</script>

<div class="mx-auto max-w-7xl space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 class="mb-2 text-3xl font-bold text-white">Blog</h2>
      <p class="text-text-body">Write, publish, and manage blog posts</p>
    </div>
    <Button href="/admin/blog/new" variant="primary">New Post</Button>
  </div>

  <DataTable data={data.posts} {columns} emptyMessage="No blog posts yet" emptyIcon="">
    {#snippet cell(row, col)}
      {#if col.key === 'title'}
        <a href="/admin/blog/{row.id}/edit" class="font-semibold text-white hover:text-primary-400">
          {row.title}
        </a>
      {:else if col.key === 'status'}
        {#if row.published}
          <Badge color="green">Published</Badge>
        {:else}
          <Badge color="zinc">Draft</Badge>
        {/if}
      {:else if col.key === 'author'}
        <span class="text-text-label">{row.author?.name ?? 'Unknown'}</span>
      {:else if col.key === 'updated'}
        <span class="text-text-body">{formatDateTime(row.updatedAt)}</span>
      {:else if col.key === 'actions'}
        <div class="flex items-center justify-end gap-2">
          <Button href="/admin/blog/{row.id}/edit" variant="secondary" size="sm">Edit</Button>
          <form
            method="POST"
            action={row.published ? '?/unpublish' : '?/publish'}
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
              };
            }}
          >
            <input type="hidden" name="id" value={row.id} />
            <Button
              type="submit"
              variant={row.published ? 'secondary' : 'success'}
              size="sm"
              disabled={isSubmitting}
            >
              {row.published ? 'Unpublish' : 'Publish'}
            </Button>
          </form>
          {#if data.isStrictAdmin}
            <Button variant="danger" size="sm" onclick={() => (deletingPost = row)}>Delete</Button>
          {/if}
        </div>
      {/if}
    {/snippet}
  </DataTable>
</div>

<ConfirmDialog
  open={!!deletingPost}
  title="Delete blog post"
  description="Are you sure you want to delete this post? This cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onConfirm={() => deleteForm?.requestSubmit()}
  onCancel={() => (deletingPost = null)}
>
  {#snippet preview()}
    <p class="font-medium text-white">{deletingPost?.title}</p>
  {/snippet}
</ConfirmDialog>

<form
  bind:this={deleteForm}
  method="POST"
  action="?/delete"
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update }) => {
      await update();
      isSubmitting = false;
      deletingPost = null;
    };
  }}
>
  <input type="hidden" name="id" value={deletingPost?.id ?? ''} />
</form>
