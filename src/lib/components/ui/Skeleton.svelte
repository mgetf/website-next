<script lang="ts">
  let { class: extraClass = '' }: { class?: string } = $props();
</script>

<div class="animate-pulse rounded-md bg-surface-input {extraClass}" aria-hidden="true"></div>
