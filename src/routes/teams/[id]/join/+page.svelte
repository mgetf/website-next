<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
  <div class="max-w-md w-full">
    <Card padding="none" class="overflow-hidden">
      <div
        class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-8 text-center border-b border-border-default"
      >
        {#if data.team.avatar}
          <img
            src={data.team.avatar}
            alt={data.team.name}
            class="w-20 h-20 rounded-lg mx-auto mb-4 object-cover"
          />
        {:else}
          <div
            class="w-20 h-20 rounded-lg bg-surface-input border border-border-input mx-auto mb-4 flex items-center justify-center"
          >
            <span class="text-3xl text-text-body">{data.team.name.charAt(0)}</span>
          </div>
        {/if}
        <h1 class="text-2xl font-bold text-white mb-2">{data.team.name}</h1>
        <p class="text-sm text-text-body">
          {data.team.division?.name || ''} • {data.team.region?.name || ''}
        </p>
      </div>

      <div class="p-8">
        {#if !data.canJoin}
          <div class="text-center">
            <div class="text-5xl mb-4">🔒</div>
            <p class="text-text-body mb-6">{data.error}</p>
            <Button href="/teams/{data.team.id}" variant="primary">View Team Page</Button>
          </div>
        {:else}
          <div class="text-center mb-6">
            <p class="text-text-label">Enter the team password to request joining this team</p>
          </div>

          <FormError error={form?.error} />

          <form
            method="POST"
            action="?/joinTeam"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
              };
            }}
          >
            <FormInput
              label="Team Password"
              name="password"
              type="password"
              required
              placeholder="Enter team password"
            />

            <Button type="submit" disabled={isSubmitting} class="w-full">
              {isSubmitting ? 'Requesting...' : 'Request to Join'}
            </Button>
          </form>

          <p class="text-xs text-text-muted text-center mt-4">
            Your request will be reviewed by admins
          </p>
        {/if}
      </div>
    </Card>
  </div>
</div>
