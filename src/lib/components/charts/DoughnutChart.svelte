<script lang="ts">
	import { onMount } from 'svelte';
	import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';

	Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

	let { labels, data } = $props<{
		labels: string[];
		data: number[];
	}>();

	let canvasElement: HTMLCanvasElement;
	let chart: Chart | null = null;

	onMount(() => {
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;

		chart = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels,
				datasets: [
					{
						data,
						backgroundColor: [
							'rgba(34, 197, 94, 0.8)',
							'rgba(239, 68, 68, 0.8)',
							'rgba(59, 130, 246, 0.8)'
						],
						borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)', 'rgba(59, 130, 246, 1)'],
						borderWidth: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: '#d4d4d8',
							padding: 15,
							font: {
								size: 12
							}
						}
					},
					tooltip: {
						backgroundColor: 'rgba(24, 24, 27, 0.95)',
						titleColor: '#fff',
						bodyColor: '#fff',
						borderColor: 'rgba(63, 63, 70, 0.8)',
						borderWidth: 1
					}
				}
			}
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

<div class="h-64 w-full flex items-center justify-center">
	<canvas bind:this={canvasElement}></canvas>
</div>
