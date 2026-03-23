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

  onMount(() => {
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: title,
            data,
            backgroundColor: 'rgba(59, 130, 246, 0.8)', // info-500
            borderColor: 'rgba(59, 130, 246, 1)', // info-500
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
            backgroundColor: 'rgba(9, 9, 11, 0.95)', // surface-page
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(39, 39, 42, 0.8)', // border-default
            borderWidth: 1,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#a1a1aa', // zinc-400 (text-body approximate)
              precision: 0,
            },
            grid: {
              color: 'rgba(39, 39, 42, 0.3)', // border-default
            },
          },
          x: {
            ticks: {
              color: '#a1a1aa', // zinc-400 (text-body approximate)
            },
            grid: {
              color: 'rgba(39, 39, 42, 0.3)', // border-default
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
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
    }
  });
</script>

<div class="h-64 w-full">
  <canvas bind:this={canvasElement}></canvas>
</div>
