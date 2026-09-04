<script lang="ts">
  import type { PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';
  import { loginToParticipateHref } from '$lib/utils/signupLogin';

  let { data }: { data: PageData } = $props();

  function actionHref(path: string) {
    return data.user ? path : loginToParticipateHref(path);
  }

  function actionLabel(whenLoggedIn: string) {
    return data.user ? whenLoggedIn : 'Login to participate!';
  }
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
      {#each data.formatSignups as formatSignup (formatSignup.format.id)}
        {@const themeClasses = getFormatThemeClasses(formatSignup.format.themeKey)}

        <div class="mb-8">
          <h2 class="text-xl font-semibold text-text-label mb-4">{formatSignup.format.name}</h2>

          {#if formatSignup.format.isIndividual}
            <!-- Individual format -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#if formatSignup.canSignup}
                <a
                  href={actionHref(`/signup/${formatSignup.format.code}`)}
                  class="group bg-surface-card border border-border-default {themeClasses.hoverBorder500} rounded-lg p-8 transition-all hover:shadow-lg {themeClasses.shadow500_25}"
                >
                  <div class="text-center">
                    <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">🏆</div>
                    <h2 class="text-2xl font-bold text-white mb-3">
                      {formatSignup.format.name} League
                    </h2>
                    <p class="text-text-body mb-4">Sign up as an individual player</p>
                    <div class="inline-block px-4 py-2 rounded-lg {themeClasses.button}">
                      {actionLabel('Sign Up →')}
                    </div>
                  </div>
                </a>
              {:else}
                <Card padding="lg" class="opacity-60 cursor-not-allowed">
                  <div class="text-center">
                    <div class="text-6xl mb-4">🏆</div>
                    <h2 class="text-2xl font-bold text-white mb-3">
                      {formatSignup.format.name} League
                    </h2>
                    <p class="text-text-body mb-4">Sign up as an individual player</p>
                    <div
                      class="inline-block px-4 py-2 bg-gray-600 text-text-label rounded-lg cursor-not-allowed"
                    >
                      Unavailable
                    </div>
                    {#if formatSignup.disabledReason}
                      <p class="text-sm text-warning-400 mt-4">
                        ⚠️ {formatSignup.disabledReason}
                      </p>
                    {/if}
                  </div>
                </Card>
              {/if}
            </div>
          {:else}
            <!-- Team format -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Create New Team -->
              {#if formatSignup.canSignup}
                <a
                  href={actionHref(`/signup/${formatSignup.format.code}/create`)}
                  class="group bg-surface-card border border-border-default hover:border-primary-600 rounded-lg p-8 transition-all hover:shadow-lg hover:shadow-orange-500/20"
                >
                  <div class="text-center">
                    <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">✨</div>
                    <h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
                    <p class="text-text-body mb-4">
                      Start fresh with a brand new {formatSignup.format.name} team
                    </p>
                    <div
                      class="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg group-hover:bg-primary-500 transition-colors"
                    >
                      {actionLabel('Get Started →')}
                    </div>
                  </div>
                </a>
              {:else}
                <Card padding="lg" class="opacity-60 cursor-not-allowed">
                  <div class="text-center">
                    <div class="text-6xl mb-4">✨</div>
                    <h2 class="text-2xl font-bold text-white mb-3">Create New Team</h2>
                    <p class="text-text-body mb-4">
                      Start fresh with a brand new {formatSignup.format.name} team
                    </p>
                    <div
                      class="inline-block px-4 py-2 bg-gray-600 text-text-label rounded-lg cursor-not-allowed"
                    >
                      Unavailable
                    </div>
                    {#if formatSignup.disabledReason}
                      <p class="text-sm text-warning-400 mt-4">
                        ⚠️ {formatSignup.disabledReason}
                      </p>
                    {/if}
                  </div>
                </Card>
              {/if}

              <!-- Re-register Existing Team (if supported) -->
              {#if formatSignup.canReregister !== undefined}
                {#if formatSignup.canReregister}
                  <a
                    href={actionHref(`/signup/${formatSignup.format.code}/existing`)}
                    class="group bg-surface-card border border-border-default {themeClasses.hoverBorder500} rounded-lg p-8 transition-all hover:shadow-lg {themeClasses.shadow500_25}"
                  >
                    <div class="text-center">
                      <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">🔄</div>
                      <h2 class="text-2xl font-bold text-white mb-3">Re-register Team</h2>
                      <p class="text-text-body mb-4">Sign up an existing team for the new season</p>
                      <div class="inline-block px-4 py-2 rounded-lg {themeClasses.button}">
                        {actionLabel('Continue →')}
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
                      {#if formatSignup.reregisterDisabledReason}
                        <p class="text-sm text-warning-400 mt-4">
                          ⚠️ {formatSignup.reregisterDisabledReason}
                        </p>
                      {/if}
                    </div>
                  </Card>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/each}

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
