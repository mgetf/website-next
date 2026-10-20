<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
  } from 'chart.js';
  import { theme, themeChartColors } from '#lib/state/theme.svelte.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  let {
    labels,
    data,
    title = 'Chart',
  } = $props<{
    labels: string[];
    data: number[];
    title?: string;
  }>();

  let canvasElement: HTMLCanvasElement;
  let chart: Chart | null = null;

  function paint(instance: Chart) {
    const colors = themeChartColors();
    const dataset = instance.data.datasets[0];
    if (dataset) {
      dataset.backgroundColor = colors.info;
      dataset.borderColor = colors.info;
    }
    const tooltip = instance.options.plugins?.tooltip;
    if (tooltip) {
      tooltip.backgroundColor = colors.surfacePage;
      tooltip.titleColor = colors.textHeading;
      tooltip.bodyColor = colors.textHeading;
      tooltip.borderColor = colors.borderDefault;
    }
    const y = instance.options.scales?.y;
    if (y?.ticks) y.ticks.color = colors.textBody;
    if (y?.grid) y.grid.color = colors.borderDefault;
    const x = instance.options.scales?.x;
    if (x?.ticks) x.ticks.color = colors.textBody;
    if (x?.grid) x.grid.color = colors.borderDefault;
  }

  onMount(() => {
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    const colors = themeChartColors();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: title,
            data,
            backgroundColor: colors.info,
            borderColor: colors.info,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: colors.surfacePage,
            titleColor: colors.textHeading,
            bodyColor: colors.textHeading,
            borderColor: colors.borderDefault,
            borderWidth: 1,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: colors.textBody,
              precision: 0,
            },
            grid: {
              color: colors.borderDefault,
            },
          },
          x: {
            ticks: {
              color: colors.textBody,
            },
            grid: {
              color: colors.borderDefault,
            },
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

<div class="h-64 w-full">
  <canvas bind:this={canvasElement}></canvas>
</div>
