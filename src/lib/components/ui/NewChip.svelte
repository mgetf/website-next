<script lang="ts">
  type Props = {
    inline?: boolean;
  };

  let { inline = false }: Props = $props();
</script>

<span
  class={[
    'text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-danger-500 text-white leading-none',
    inline ? 'shrink-0' : 'absolute -top-1 -right-1',
  ]}>new</span
>
