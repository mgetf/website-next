<script lang="ts">
  import Sun from '~icons/lucide/sun';
  import Moon from '~icons/lucide/moon';
  import { theme } from '#lib/state/theme.svelte.js';
</script>

<button
  type="button"
  onclick={() => theme.toggle()}
  class="p-1.5 text-text-body hover:text-text-heading hover:bg-surface-input/50 transition-colors rounded-md"
  aria-label="Toggle color theme"
>
  <Sun class="theme-toggle-sun size-5" />
  <Moon class="theme-toggle-moon size-5" />
</button>
