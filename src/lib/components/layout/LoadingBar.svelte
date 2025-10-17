<script lang="ts">
	import { navigating } from '$app/stores';
	import { onMount } from 'svelte';
	
	let progress = $state(0);
	let isVisible = $state(false);
	let animationFrame: number;
	let unsubscribe: (() => void) | undefined;
	
	onMount(() => {
		unsubscribe = navigating.subscribe((nav) => {
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
		});
		
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
			if (animationFrame) {
				cancelAnimationFrame(animationFrame);
			}
		};
	});
</script>

<div 
	class="loading-bar"
	class:visible={isVisible}
	style="width: {progress}%"
></div>

<style>
	.loading-bar {
		position: fixed;
		top: 0;
		left: 0;
		height: 3px;
		background: linear-gradient(90deg, #ef4444, #f97316, #eab308);
		box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
		z-index: 9999;
		opacity: 0;
		transition: width 0.2s ease-out, opacity 0.3s ease;
		will-change: width;
	}
	
	.loading-bar.visible {
		opacity: 1;
	}
</style>

