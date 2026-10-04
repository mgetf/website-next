<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import {
    groupedProfilingFields,
    getProfilingWeightValue,
    PROFILING_FIELDS,
  } from '$lib/utils/profiling';

  let { data }: { data: PageData } = $props();

  let values = $state<Record<string, string>>(
    Object.fromEntries(PROFILING_FIELDS.map((field) => [field.path, ''])),
  );
  let saving = $state(false);
  let showReset = $state(false);
  let resetForm: HTMLFormElement | undefined = $state();

  const groups = groupedProfilingFields();

  $effect(() => {
    const next: Record<string, string> = {};
    for (const field of PROFILING_FIELDS) {
      next[field.path] = String(getProfilingWeightValue(data.settings.weights, field.path));
    }
    values = next;
  });
</script>

<div class="mx-auto max-w-7xl space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-white mb-2">Profiling weights</h1>
    <p class="text-text-body">
      Calibrate every trust, skill, and uncertainty coefficient. Axis weights renormalize among
      signals that have data, so they do not need to sum to 1. Skill is evidence of high-level play,
      not a recommended division.
    </p>
  </div>

  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      saving = true;
      return async ({ result, update }) => {
        saving = false;
        await update({ reset: false });
        if (result.type === 'success') {
          toast.success((result.data as { message?: string })?.message || 'Saved');
        } else if (result.type === 'failure') {
          toast.error((result.data as { error?: string })?.error || 'Failed to save');
        }
      };
    }}
    class="space-y-3"
  >
    {#each groups as group (group.group)}
      <Card padding="sm">
        {#snippet header()}
          <h2 class="text-base font-semibold text-white">{group.group}</h2>
        {/snippet}
        <div class="grid gap-x-4 gap-y-2 md:grid-cols-2">
          {#each group.fields as field (field.path)}
            <FormInput
              label={field.label}
              name={field.path}
              type="number"
              step="any"
              min="0"
              compact
              bind:value={values[field.path]}
              hint="Default: {getProfilingWeightValue(data.settings.defaults, field.path)}"
            />
          {/each}
        </div>
      </Card>
    {/each}

    <div class="flex flex-wrap gap-3">
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save weights'}
      </Button>
      <Button type="button" variant="secondary" onclick={() => (showReset = true)}>
        Reset to defaults
      </Button>
    </div>
  </form>

  <form bind:this={resetForm} method="POST" action="?/reset" class="hidden"></form>
</div>

<ConfirmDialog
  open={showReset}
  title="Reset profiling weights"
  description="Restore every weight and threshold to the code defaults?"
  confirmLabel="Reset"
  variant="warning"
  onConfirm={() => {
    showReset = false;
    resetForm?.requestSubmit();
  }}
  onCancel={() => (showReset = false)}
/>
