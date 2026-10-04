<script lang="ts">
  let { name, onOpen }: { name: string; onOpen: (event: MouseEvent) => void } = $props();
</script>

<button
  type="button"
  class="text-[10px] leading-tight font-normal text-text-muted hover:text-white"
  title="Right-click for a profiling snapshot"
  onpointerdown={(event) => {
    if (event.button === 2) event.stopPropagation();
  }}
  oncontextmenu={(event) => onOpen(event)}
>
  {name}
</button>
