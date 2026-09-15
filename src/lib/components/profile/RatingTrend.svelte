<script lang="ts" module>
  function niceTicks(min: number, max: number, count: number): number[] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) {
      const pad = min === 0 ? 1 : Math.max(1, Math.round(Math.abs(min) * 0.02));
      return [min - pad, min, min + pad];
    }
    const span = max - min;
    const raw = span / Math.max(1, count - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const residual = raw / mag;
    const step = residual <= 1 ? mag : residual <= 2 ? 2 * mag : residual <= 5 ? 5 * mag : 10 * mag;
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let value = niceMin; value <= niceMax + step / 2; value += step) {
      ticks.push(Math.round(value));
    }
    return ticks;
  }

  function pointerToViewBoxX(event: PointerEvent, svg: SVGSVGElement): number | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return cursor.x;
  }
</script>

<script lang="ts">
  type Point = { label: string; value: number };
  type Plotted = { label: string; value: number; x: number; y: number };

  let { points, compact = false }: { points: Point[]; compact?: boolean } = $props();

  let compactBox = $state({ w: 320, h: 80 });

  function attachCompactBox(node: HTMLElement) {
    let lastW = 0;
    let lastH = 0;
    const update = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      compactBox = { w, h };
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }

  const WIDTH = $derived(compact ? Math.max(1, compactBox.w) : 720);
  const HEIGHT = $derived(compact ? Math.max(1, compactBox.h) : 240);
  const PAD_L = $derived(compact ? 34 : 52);
  const PAD_R = $derived(compact ? 6 : 16);
  const PAD_T = $derived(compact ? 4 : 16);
  const PAD_B = $derived(compact ? 14 : 32);
  const INNER_W = $derived(Math.max(1, WIDTH - PAD_L - PAD_R));
  const INNER_H = $derived(Math.max(1, HEIGHT - PAD_T - PAD_B));
  const X_TICKS = $derived(compact ? 3 : 6);
  const Y_TICKS = $derived(compact ? 3 : 6);
  const FONT = $derived(compact ? 9 : 11);
  const LINE = $derived(compact ? 1.5 : 2);
  const DOT_LIMIT = 60;

  let hover = $state<Plotted | null>(null);

  const plot = $derived.by(() => {
    if (points.length === 0) return null;

    const values = points.map((point) => point.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const yTicks = niceTicks(dataMin, dataMax, Y_TICKS);
    const min = yTicks[0];
    const max = yTicks[yTicks.length - 1];
    if (min == null || max == null || max === min) return null;

    const n = points.length;
    const xOf = (i: number) => PAD_L + (n === 1 ? INNER_W / 2 : (i / (n - 1)) * INNER_W);
    const yOf = (value: number) => PAD_T + ((max - value) / (max - min)) * INNER_H;

    const plotted: Plotted[] = points.map((point, i) => ({
      ...point,
      x: xOf(i),
      y: yOf(point.value),
    }));
    const firstPlotted = plotted[0];
    const lastPlotted = plotted[plotted.length - 1];
    if (!firstPlotted || !lastPlotted) return null;

    const d = plotted
      .map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');
    const baseline = PAD_T + INNER_H;
    const area = `${d} L${lastPlotted.x.toFixed(2)} ${baseline.toFixed(2)} L${firstPlotted.x.toFixed(2)} ${baseline.toFixed(2)} Z`;

    const tickCount = Math.min(X_TICKS, plotted.length);
    const xTicks: { x: number; label: string }[] = [];
    const usedIdx: boolean[] = [];
    if (tickCount === 1) {
      xTicks.push({ x: firstPlotted.x, label: firstPlotted.label });
    } else {
      for (let i = 0; i < tickCount; i++) {
        const idx = Math.round((i / Math.max(1, tickCount - 1)) * (plotted.length - 1));
        if (usedIdx[idx]) continue;
        usedIdx[idx] = true;
        const point = plotted[idx];
        if (!point) continue;
        xTicks.push({ x: point.x, label: point.label });
      }
    }

    const peakPlotted = plotted.reduce(
      (best, point) => (point.value > best.value ? point : best),
      firstPlotted,
    );

    return { min, max, yTicks, xTicks, d, area, plotted, peakPlotted, lastPlotted };
  });

  const shownHover = $derived.by(() => {
    const current = hover;
    if (!current || !plot) return null;
    return (
      plot.plotted.find(
        (point) => point.label === current.label && point.value === current.value,
      ) ?? null
    );
  });

  const tooltipLeft = $derived(
    shownHover ? Math.min(92, Math.max(8, (shownHover.x / WIDTH) * 100)) : 50,
  );

  function onPointerMove(event: PointerEvent) {
    if (!plot) return;
    const svg = event.currentTarget as SVGSVGElement;
    const x = pointerToViewBoxX(event, svg);
    if (x == null) return;
    let nearest = plot.plotted[0];
    if (!nearest) return;
    let best = Math.abs(nearest.x - x);
    for (const point of plot.plotted) {
      const dist = Math.abs(point.x - x);
      if (dist < best) {
        best = dist;
        nearest = point;
      }
    }
    hover = nearest;
  }

  function onPointerLeave() {
    hover = null;
  }
</script>

{#if plot}
  <div
    class={compact ? 'relative h-20 w-full' : 'relative aspect-[3/1] w-full'}
    {@attach compact ? attachCompactBox : undefined}
  >
    <svg
      class="h-full w-full cursor-crosshair"
      viewBox="0 0 {WIDTH} {HEIGHT}"
      role="img"
      aria-label="Rating over time, peak {plot.peakPlotted.value}"
      onpointermove={onPointerMove}
      onpointerleave={onPointerLeave}
    >
      {#each plot.yTicks as tick (tick)}
        <line
          x1={PAD_L}
          y1={PAD_T + ((plot.max - tick) / (plot.max - plot.min)) * INNER_H}
          x2={WIDTH - PAD_R}
          y2={PAD_T + ((plot.max - tick) / (plot.max - plot.min)) * INNER_H}
          class="stroke-border-default"
          stroke-width="1"
        />
        <text
          x={PAD_L - 4}
          y={PAD_T + ((plot.max - tick) / (plot.max - plot.min)) * INNER_H + 3}
          text-anchor="end"
          class="fill-text-muted"
          font-size={FONT}>{tick}</text
        >
      {/each}
      {#each plot.xTicks as tick, i (`${tick.x}:${tick.label}:${i}`)}
        {#if !compact}
          <line
            x1={tick.x}
            y1={PAD_T}
            x2={tick.x}
            y2={HEIGHT - PAD_B}
            class="stroke-border-default"
            stroke-width="1"
          />
        {/if}
        <text
          x={tick.x}
          y={HEIGHT - (compact ? 3 : 8)}
          text-anchor="middle"
          class="fill-text-muted"
          font-size={FONT}>{tick.label}</text
        >
      {/each}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L}
        y2={HEIGHT - PAD_B}
        class="stroke-text-muted"
        stroke-width="1.25"
      />
      <line
        x1={PAD_L}
        y1={HEIGHT - PAD_B}
        x2={WIDTH - PAD_R}
        y2={HEIGHT - PAD_B}
        class="stroke-text-muted"
        stroke-width="1.25"
      />
      <path d={plot.area} class="fill-primary-500/10" />
      <path
        d={plot.d}
        fill="none"
        class="stroke-primary-500"
        stroke-width={LINE}
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      {#if !compact && plot.plotted.length <= DOT_LIMIT}
        {#each plot.plotted as point, i (`${point.label}:${point.value}:${i}`)}
          <circle cx={point.x} cy={point.y} r="3" class="fill-primary-500" />
        {/each}
      {/if}
      <circle
        cx={plot.peakPlotted.x}
        cy={plot.peakPlotted.y}
        r={compact ? 3 : 5}
        class="fill-success-400"
      />
      <circle
        cx={plot.lastPlotted.x}
        cy={plot.lastPlotted.y}
        r={compact ? 2.5 : 3}
        class="fill-primary-500"
      />
      {#if shownHover}
        <line
          x1={shownHover.x}
          y1={PAD_T}
          x2={shownHover.x}
          y2={HEIGHT - PAD_B}
          class="stroke-primary-500"
          opacity="0.45"
          stroke-width="1"
        />
        <circle
          cx={shownHover.x}
          cy={shownHover.y}
          r={compact ? 3.5 : 5}
          class="fill-primary-500 stroke-surface-card"
          stroke-width="2"
        />
      {/if}
    </svg>
    {#if shownHover}
      <div
        class="pointer-events-none absolute top-1 z-10 rounded-md border border-border-default bg-surface-card px-2 py-1 text-xs shadow-sm"
        style:left="{tooltipLeft}%"
        style:transform="translateX(-50%)"
      >
        <p class="font-medium text-white">{shownHover.value}</p>
        <p class="text-text-muted">{shownHover.label}</p>
      </div>
    {/if}
  </div>
{/if}
