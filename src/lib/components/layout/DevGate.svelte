<script lang="ts">
/**
 * DevGate Component
 * Shown when the site is in staging/dev mode and the user is not an admin.
 * Provides a Steam login button and explains the access restriction.
 */

import type { SessionUser } from '$lib/types/user';
import signInThroughSteam from '$lib/assets/signin-thru-steam.png';

interface Props {
  user: SessionUser | null;
}

let { user }: Props = $props();
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-gray-200 p-6">
  <div class="max-w-md w-full text-center space-y-8">
    <!-- Environment Badge -->
    <div class="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-full">
      <span class="relative flex h-3 w-3">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
      </span>
      <span class="text-amber-400 font-medium text-sm uppercase tracking-wide">Development Environment</span>
    </div>

    <!-- Logo / Title -->
    <div class="space-y-4">
      <h1 class="text-4xl font-bold text-white">MGE.tf Dev</h1>
      <p class="text-zinc-400 text-lg">
        This is the development/staging version of MGE.tf
      </p>
    </div>

    <!-- Access Message -->
    <div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
      {#if user}
        <!-- User is logged in but not admin -->
        <div class="flex items-center justify-center gap-3">
          <img 
            src={user.steamAvatar} 
            alt={user.steamUsername}
            class="w-12 h-12 rounded-full border-2 border-zinc-700"
          />
          <div class="text-left">
            <p class="text-white font-medium">{user.steamUsername}</p>
            <p class="text-zinc-500 text-sm">Logged in via Steam</p>
          </div>
        </div>
        
        <div class="border-t border-zinc-800 pt-4">
          <div class="flex items-center justify-center gap-2 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span class="font-medium">Access Denied</span>
          </div>
          <p class="text-zinc-400 text-sm mt-2">
            Only administrators can access the development site. If you believe you should have access, please contact an admin.
          </p>
        </div>

        <a 
          href="/auth/logout"
          class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
        >
          Sign out
        </a>
      {:else}
        <!-- User is not logged in -->
        <div class="flex items-center justify-center gap-2 text-zinc-400 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
          </svg>
          <span class="font-medium">Admin Access Required</span>
        </div>
        
        <p class="text-zinc-400 text-sm mb-6">
          This site is restricted to administrators only. Please sign in with Steam to verify your access.
        </p>

        <a 
          href="/auth/login"
          class="inline-block hover:opacity-80 transition-opacity"
          title="Sign in through Steam"
        >
          <img 
            src={signInThroughSteam} 
            alt="Sign in through Steam" 
            class="h-9"
          />
        </a>
      {/if}
    </div>

    <!-- Footer Info -->
    <p class="text-zinc-600 text-xs">
      Looking for the live site? Visit <a href="https://mge.tf" class="text-blue-500 hover:underline">mge.tf</a>
    </p>
  </div>
</div>
