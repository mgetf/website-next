<script lang="ts">
  import { resolve } from '$app/paths';
  import Badge from '#lib/components/ui/Badge.svelte';
  import type { TeamRosterPlayer } from '#lib/types/team.js';
  import { classIcon } from '#lib/utils/classIcons.js';
  import ShieldAlert from '~icons/lucide/shield-alert';

  const DEFAULT_AVATAR = '/default-avatar.png';

  let { players }: { players: TeamRosterPlayer[] } = $props();

  const restricted = $derived(players.filter((player) => player.restrictedClasses.length > 0));
</script>

{#if restricted.length > 0}
  <div class="border-b border-warning-500/40 bg-warning-500/10">
    <div class="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <div class="mb-3 flex items-center gap-2">
        <ShieldAlert class="size-5 shrink-0 text-warning-400" />
        <h2 class="text-base font-bold text-white">Class restrictions</h2>
      </div>
      <ul class="space-y-3">
        {#each restricted as player (player.steamId)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <a
              href={resolve('/users/[steamId]', { steamId: player.steamId })}
              class="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-primary-400"
            >
              <img
                src={player.avatar || DEFAULT_AVATAR}
                alt=""
                class="size-8 rounded-lg object-cover"
              />
              <span class="truncate">{player.name}</span>
            </a>
            <span class="text-sm text-warning-400">cannot play</span>
            <span class="flex flex-wrap items-center gap-2">
              {#each player.restrictedClasses as tfClass (tfClass.id)}
                {@const icon = classIcon(tfClass.name)}
                <Badge color="yellow">
                  {#if icon}
                    <img src={icon} alt="" class="mr-1 size-4" />
                  {/if}
                  {tfClass.label}
                </Badge>
              {/each}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
