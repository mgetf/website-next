<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import type { Crepe } from '@milkdown/crepe';
  import '@milkdown/crepe/theme/common/style.css';
  import '@milkdown/crepe/theme/classic-dark.css';

  type Mode = 'live' | 'raw';

  let {
    value = $bindable(''),
    name,
    id,
    disabled = false,
    placeholder = '',
    rows,
    minHeight,
    compact = false,
    required = false,
    class: extraClass = '',
    uploadImage,
  }: {
    value?: string;
    name?: string;
    id?: string;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    minHeight?: string;
    compact?: boolean;
    required?: boolean;
    class?: string;
    /** When provided, enables the image block feature and uploads files through this callback. */
    uploadImage?: (file: File) => Promise<string>;
  } = $props();

  let mode = $state<Mode>('live');

  let snapshot = value;
  let lastEmitted = value;
  let applyingExternal = false;

  const editorMinHeight = $derived(
    minHeight ??
      (rows ? `${Math.max(rows * 1.25, compact ? 6 : 10)}rem` : compact ? '7rem' : '16rem'),
  );

  function setMode(next: Mode) {
    if (next === mode) return;
    if (next === 'live') {
      snapshot = value;
      lastEmitted = value;
    }
    mode = next;
  }

  const attachEditor: Attachment<HTMLDivElement> = (node) => {
    let destroyed = false;
    let instance: Crepe | null = null;
    let doReplace: ((markdown: string) => void) | null = null;
    const initialValue = snapshot;
    const placeholderText = placeholder;
    const isCompact = compact;
    const onUploadImage = uploadImage;

    function syncFromValue() {
      const next = value;
      if (!instance || !doReplace || applyingExternal) return;
      if (next === lastEmitted) return;
      lastEmitted = next;
      applyingExternal = true;
      doReplace(next);
      applyingExternal = false;
    }

    void (async () => {
      const [{ Crepe }, { replaceAll }] = await Promise.all([
        import('@milkdown/crepe'),
        import('@milkdown/kit/utils'),
      ]);
      if (destroyed) return;

      instance = new Crepe({
        root: node,
        defaultValue: initialValue,
        features: {
          [Crepe.Feature.Latex]: false,
          [Crepe.Feature.ImageBlock]: Boolean(onUploadImage),
          [Crepe.Feature.AI]: false,
          [Crepe.Feature.TopBar]: false,
          ...(isCompact
            ? {
                [Crepe.Feature.Table]: false,
                [Crepe.Feature.CodeMirror]: false,
                [Crepe.Feature.BlockEdit]: false,
              }
            : {}),
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: placeholderText || 'Start writing...',
            mode: 'block',
          },
          ...(onUploadImage
            ? {
                [Crepe.Feature.ImageBlock]: {
                  onUpload: onUploadImage,
                },
              }
            : {}),
        },
      });

      instance.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (applyingExternal) return;
          lastEmitted = markdown;
          value = markdown;
        });
      });

      await instance.create();
      if (destroyed) {
        await instance.destroy();
        instance = null;
        return;
      }

      doReplace = (markdown) => {
        instance?.editor.action(replaceAll(markdown, true));
      };
      instance.setReadonly(disabled);
      syncFromValue();
    })();

    $effect(() => {
      syncFromValue();
    });

    $effect(() => {
      instance?.setReadonly(disabled);
    });

    return () => {
      destroyed = true;
      doReplace = null;
      void instance?.destroy();
      instance = null;
    };
  };
</script>

<div
  class={[
    'overflow-hidden rounded-lg border border-border-input bg-surface-input',
    disabled && 'opacity-50',
    extraClass,
  ]}
  data-markdown-editor
  style:--editor-min-height={editorMinHeight}
>
  <div
    class="flex items-center justify-between gap-2 border-b border-border-input bg-surface-page/50 px-2 py-1.5"
  >
    <div
      class="flex gap-1 rounded-md bg-surface-input p-0.5"
      role="tablist"
      aria-label="Editor mode"
    >
      <button
        type="button"
        role="tab"
        id={id ? `${id}-tab-live` : undefined}
        aria-selected={mode === 'live'}
        aria-controls={id}
        {disabled}
        class={[
          'rounded px-3 py-1 text-xs font-semibold transition-all',
          mode === 'live' ? 'bg-surface-hover text-white' : 'text-text-body hover:text-white',
        ]}
        onclick={() => setMode('live')}
      >
        Live
      </button>
      <button
        type="button"
        role="tab"
        id={id ? `${id}-tab-raw` : undefined}
        aria-selected={mode === 'raw'}
        aria-controls={id}
        {disabled}
        class={[
          'rounded px-3 py-1 text-xs font-semibold transition-all',
          mode === 'raw' ? 'bg-surface-hover text-white' : 'text-text-body hover:text-white',
        ]}
        onclick={() => setMode('raw')}
      >
        Raw
      </button>
    </div>
  </div>

  {#if name}
    <input type="hidden" {name} bind:value {required} />
  {/if}

  {#if mode === 'live'}
    <div
      {id}
      role="tabpanel"
      aria-labelledby={id ? `${id}-tab-live` : undefined}
      class="editor-live"
      {@attach attachEditor}
    ></div>
  {:else}
    <textarea
      {id}
      role="tabpanel"
      aria-labelledby={id ? `${id}-tab-raw` : undefined}
      data-markdown-raw
      bind:value={
        () => value,
        (next) => {
          lastEmitted = next;
          value = next;
        }
      }
      {placeholder}
      {disabled}
      {required}
      rows={rows ?? (compact ? 4 : 12)}
      class="editor-raw w-full resize-y bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-white outline-none placeholder-text-muted focus:ring-0 disabled:cursor-not-allowed"
    ></textarea>
  {/if}
</div>

<style>
  .editor-live {
    min-height: var(--editor-min-height);
    overflow: auto;
  }

  .editor-raw {
    min-height: var(--editor-min-height);
  }

  .editor-live :global(.milkdown) {
    --crepe-color-background: transparent;
    --crepe-color-on-background: var(--color-white);
    --crepe-color-surface: var(--color-surface-card);
    --crepe-color-surface-low: var(--color-surface-page);
    --crepe-color-on-surface: var(--color-white);
    --crepe-color-on-surface-variant: var(--color-text-body);
    --crepe-color-outline: var(--color-text-label);
    --crepe-color-primary: var(--color-primary-500);
    --crepe-color-secondary: var(--color-surface-hover);
    --crepe-color-on-secondary: var(--color-white);
    --crepe-color-inverse: var(--color-white);
    --crepe-color-on-inverse: var(--color-surface-page);
    --crepe-color-inline-code: var(--color-primary-400);
    --crepe-color-error: var(--color-danger-400);
    --crepe-color-hover: var(--color-surface-hover);
    --crepe-color-selected: var(--color-surface-hover);
    --crepe-color-inline-area: var(--color-surface-card);
    --crepe-font-default: inherit;
    --crepe-font-title: inherit;
    --crepe-base-font-size: 16px;
    min-height: var(--editor-min-height);
    background: transparent;
  }

  .editor-live :global(.milkdown .ProseMirror) {
    padding: 0.75rem 1rem;
    min-height: var(--editor-min-height);
    outline: none;
    color: var(--color-white);
  }

  .editor-live :global(.milkdown .ProseMirror p) {
    line-height: 1.65;
  }

  .editor-live :global(.milkdown .ProseMirror blockquote) {
    color: var(--color-text-label);
  }
</style>
