<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
  import { theme, themeChartColors } from '#lib/state/theme.svelte.js';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  let { labels, data } = $props<{
    labels: string[];
    data: number[];
  }>();

  let canvasElement: HTMLCanvasElement;
  let chart: Chart | null = null;

  function sliceColors(colors: ReturnType<typeof themeChartColors>) {
    return [colors.success, colors.danger, colors.info];
  }

  function paint(instance: Chart) {
    const colors = themeChartColors();
    const slices = sliceColors(colors);
    const dataset = instance.data.datasets[0];
    if (dataset) {
      dataset.backgroundColor = slices;
      dataset.borderColor = slices;
    }
    const legend = instance.options.plugins?.legend?.labels;
    if (legend) legend.color = colors.textLabel;
    const tooltip = instance.options.plugins?.tooltip;
    if (tooltip) {
      tooltip.backgroundColor = colors.surfacePage;
      tooltip.titleColor = colors.textHeading;
      tooltip.bodyColor = colors.textHeading;
      tooltip.borderColor = colors.borderDefault;
    }
  }

  onMount(() => {
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    const colors = themeChartColors();
    const slices = sliceColors(colors);
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: slices,
            borderColor: slices,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: colors.textLabel,
              padding: 15,
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            backgroundColor: colors.surfacePage,
            titleColor: colors.textHeading,
            bodyColor: colors.textHeading,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        },
      },
    });

    return () => {
      chart?.destroy();
    };
  });

  $effect(() => {
    theme.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    paint(chart);
    chart.update();
  });
</script>

<div class="h-64 w-full flex items-center justify-center">
  <canvas bind:this={canvasElement}></canvas>
</div>
