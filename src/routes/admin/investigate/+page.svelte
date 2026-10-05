<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import InvestigationReport from '$lib/components/admin/InvestigationReport.svelte';

  let { data }: { data: PageData } = $props();

  let query = $state<string | null>('');
  $effect(() => {
    query = data.q;
  });
</script>

<div class="mx-auto max-w-7xl space-y-4 sm:space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-white mb-2">Investigate</h1>
    <p class="text-text-body">
      Search a Steam ID, profile URL, personaname, or IPv4 across mirrored whois logs. Alt matches
      ignore SDR relays and private IPs.
    </p>
  </div>

  {#if !data.configured}
    <InvestigationReport configured={false} result={null} />
  {:else}
    <Card padding="sm">
      <form method="GET" class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1 [&>div]:mb-0">
          <FormInput
            label="Steam ID, profile, name, or IP"
            name="q"
            bind:value={query}
            placeholder="Steam ID, steamcommunity URL, personaname, or IPv4"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" class="w-full sm:w-auto shrink-0">
          Search
        </Button>
      </form>
    </Card>

    {#if !data.result}
      <p class="text-text-muted text-sm">
        Enter a Steam ID, profile URL, personaname, or public IPv4 to load connection history and
        alt candidates.
      </p>
    {:else}
      <InvestigationReport result={data.result} profiling={data.profiling} />
    {/if}
  {/if}
</div>
