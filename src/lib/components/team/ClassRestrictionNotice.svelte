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

