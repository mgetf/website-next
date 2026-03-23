<script lang="ts">
  import type { PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
  <div class="max-w-5xl w-full">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-white mb-4">League Signups</h1>
      <p class="text-text-body text-lg">Sign up for the upcoming season</p>
    </div>

    {#if data.allSignupsClosed}
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">🔒</div>
        <h2 class="text-2xl font-bold text-white mb-4">Signups Are Closed</h2>
        <p class="text-text-body text-lg">
          Signups are not currently open. Check back later or join our Discord for updates.
        </p>
        <div class="mt-6">
          <Button href="/" variant="primary" size="lg">Back to Home</Button>
        </div>
      </Card>
    {:else}
      <!-- 2v2 Team Section -->
      <div class="mb-8">
        <h2 class="text-xl font-semibold text-text-label mb-4">2v2 Teams</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Create New Team -->
          {#if data.canCreateNew}
            <a
              href="/signup/2v2/create"
              class="group bg-surface-card border border-border-default hover:border-primary-600 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-orange-500/20"
            >
              <div class="text-center">
                <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">✨</div>
                <h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
                <p class="text-text-body mb-4">Start fresh with a brand new team for this season</p>
                <div
                  class="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg group-hover:bg-primary-500 transition-colors"
                >
                  Get Started →
                </div>
              </div>
            </a>
          {:else}
            <Card padding="lg" class="opacity-60 cursor-not-allowed">
              <div class="text-center">
                <div class="text-6xl mb-4">✨</div>
                <h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
                <p class="text-text-body mb-4">Start fresh with a brand new team for this season</p>
                <div
                  class="inline-block px-4 py-2 bg-gray-600 text-text-label rounded-lg cursor-not-allowed"
                >
                  Unavailable
                </div>
                <p class="text-sm text-warning-400 mt-4">
                  &#9888;&#65039; {data.createDisabledReason}
                </p>
              </div>
            </Card>
          {/if}

          <!-- Re-register Existing Team -->
          {#if data.canReregister}
            <a
              href="/signup/2v2/existing"
              class="group bg-surface-card border border-border-default hover:border-format-2v2-500 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-blue-500/20"
            >
              <div class="text-center">
                <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">🔄</div>
                <h2 class="text-2xl font-bold text-white mb-3">Re-register Team</h2>
                <p class="text-text-body mb-4">Sign up an existing team for the new season</p>
                <div
                  class="inline-block px-4 py-2 bg-format-2v2-600 text-white rounded-lg group-hover:bg-format-2v2-500 transition-colors"
                >
                  Continue →
                </div>
              </div>
            </a>
          {:else}
            <Card padding="lg" class="opacity-60 cursor-not-allowed">
              <div class="text-center">
                <div class="text-6xl mb-4">🔄</div>
                <h2 class="text-2xl font-bold text-white mb-3">Re-register Team</h2>
                <p class="text-text-body mb-4">Sign up an existing team for the new season</p>
                <div
                  class="inline-block px-4 py-2 bg-gray-600 text-text-label rounded-lg cursor-not-allowed"
                >
                  Unavailable
                </div>
                <p class="text-sm text-warning-400 mt-4">
                  &#9888;&#65039; {data.reregisterDisabledReason}
                </p>
              </div>
            </Card>
          {/if}
        </div>
      </div>

      <!-- 1v1 Individual Section -->
      {#if data.activeFormatCodes.includes('1v1')}
        <div class="mb-8">
          <h2 class="text-xl font-semibold text-text-label mb-4">1v1 Individual</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- 1v1 Signup -->
            {#if data.can1v1Signup}
              <a
                href="/signup/1v1"
                class="group bg-surface-card border border-border-default hover:border-format-1v1-500 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-purple-500/20"
              >
                <div class="text-center">
                  <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">
                    &#127919;
                  </div>
                  <h2 class="text-2xl font-bold text-white mb-3">1v1 League</h2>
                  <p class="text-text-body mb-4">Sign up as an individual player for 1v1 matches</p>
                  <div
                    class="inline-block px-4 py-2 bg-format-1v1-600 text-white rounded-lg group-hover:bg-format-1v1-500 transition-colors"
                  >
                    Sign Up &rarr;
                  </div>
                </div>
              </a>
            {:else}
              <Card padding="lg" class="opacity-60 cursor-not-allowed">
                <div class="text-center">
                  <div class="text-6xl mb-4">&#127919;</div>
                  <h2 class="text-2xl font-bold text-white mb-3">1v1 League</h2>
                  <p class="text-text-body mb-4">Sign up as an individual player for 1v1 matches</p>
                  <div
                    class="inline-block px-4 py-2 bg-gray-600 text-text-label rounded-lg cursor-not-allowed"
                  >
                    Unavailable
                  </div>
                  <p class="text-sm text-warning-400 mt-4">
                    &#9888;&#65039; {data.signup1v1DisabledReason}
                  </p>
                </div>
              </Card>
            {/if}
          </div>
        </div>
      {/if}

      <div class="mt-8 text-center text-text-muted text-sm">
        <p>
          Need help? Check out our <a
            href="/rulebook"
            class="text-primary-500 hover:text-primary-400">rulebook</a
          > or join our Discord
        </p>
      </div>
    {/if}
  </div>
</div>
