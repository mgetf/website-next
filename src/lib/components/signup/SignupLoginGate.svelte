<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { loginToParticipateHref } from '$lib/utils/signupLogin';

  const href = $derived(loginToParticipateHref(page.url.pathname));
</script>

<Card padding="none" class="p-12 text-center">
  <h2 class="text-2xl font-bold text-white mb-4">Login to participate</h2>
  <p class="text-text-body text-lg mb-6">Sign in with Steam to continue signing up.</p>
  <Button {href} variant="primary" size="lg">Login to participate!</Button>
</Card>
