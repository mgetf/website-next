<script lang="ts">
  let { code, class: className = '' }: { code: string; class?: string } = $props();
</script>

<span class="fi fi-{code.toLowerCase()} rounded-lg shrink-0 {className}"></span>
