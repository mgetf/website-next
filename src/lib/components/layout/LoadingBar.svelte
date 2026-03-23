<script lang="ts">
  import { navigating } from '$app/state';

  let progress = $state(0);
  let isVisible = $state(false);
  let animationFrame: number;

  $effect(() => {
    const nav = navigating.to;

    if (nav) {
      isVisible = true;
      progress = 0;

      const startTime = Date.now();
      const duration = 3000;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const baseProgress = Math.min((elapsed / duration) * 100, 90);

        progress = baseProgress + Math.random() * 2;

        if (progress < 90) {
          animationFrame = requestAnimationFrame(animate);
        }
      };

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(animate);
    } else if (isVisible) {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      progress = 100;

      setTimeout(() => {
        isVisible = false;
        progress = 0;
      }, 400);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  });
</script>

<div class="loading-bar" class:visible={isVisible} style="width: {progress}%"></div>

<style>
  .loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(
      90deg,
      var(--color-danger-500),
      var(--color-primary-500),
      var(--color-warning-500)
    );
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-danger-500) 50%, transparent);
    z-index: 9999;
    opacity: 0;
    transition:
      width 0.2s ease-out,
      opacity 0.3s ease;
    will-change: width;
  }

  .loading-bar.visible {
    opacity: 1;
  }
</style>
