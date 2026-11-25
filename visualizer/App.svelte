<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import { readNative } from '../construction/native';
  import { tieAt } from './model';
  import { axisColors, sampleColors, sceneGeometry, view } from './view';
  import { palettes } from './palettes';
  import { openScene } from './scene';

  import { placeTies } from './repeated';

  const query = new URLSearchParams(location.search);
  const embedded = query.has('preview') && parent !== window;
  const repeated = query.has('repeated');
  let theme = $state<'dark' | 'light'>(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const { bg, ink } = $derived(palettes[theme]);
  let canvas: HTMLCanvasElement;
  let geometry = $state<ReturnType<typeof sceneGeometry>>();
  let distance = $state<number>();
  let error = $state('');

  onMount(() => {
    let scene: Awaited<ReturnType<typeof openScene>> | undefined;
    let disposed = false;
    let scheduled = 0;
    let receive: ((event: MessageEvent) => void) | undefined;
    const reply = (id: number) => parent.postMessage({ oneTieReady: id }, location.origin);
    void (async () => {
      const snapshot = await readNative(new URL('assets/blitz-tie.gltf', document.baseURI));
      if (disposed) return;
      const evaluate = (value = repeated ? .4 : 2) => repeated
        ? { construction: placeTies({ snapshot }, value), distance: value, pose: undefined }
        : tieAt({ snapshot }, value);
      const result = evaluate();
      scene = await openScene(canvas, result.construction, embedded, repeated);
      if (disposed) { scene.dispose(); return; }
      if (!embedded) {
        scene.render(result.construction, bg, theme);
        await scene.holdStill();
        if (!disposed) {
          geometry = result.pose && sceneGeometry(result.pose, result.distance);
          distance = result.distance;
        }
        return;
      }
      type Request = { id: number; distance: number; theme: 'light' | 'dark' };
      let pending: Request | undefined;
      let busy = false;
      function schedule() {
        if (disposed || scheduled || busy || !pending) return;
        scheduled = requestAnimationFrame(async () => {
          scheduled = 0;
          busy = true;
          const next = pending!;
          pending = undefined;
          let render: () => void;
          try {
            const tie = evaluate(next.distance);
            const annotations = tie.pose && sceneGeometry(tie.pose, tie.distance);
            const present = await scene!.prepareLive(tie.construction, palettes[next.theme].bg, next.theme);
            render = () => {
              present();
              flushSync(() => {
                theme = next.theme;
                geometry = annotations;
                distance = tie.distance;
              });
            };
          } catch (error) {
            render = () => { throw error; };
          }
          // The host rejects stale success and failure alike, including a newer
          // request whose message hasn't reached this iframe yet.
          if (!disposed && !pending) frameElement?.dispatchEvent(new CustomEvent('one-tie-frame', {
            detail: { id: next.id, render },
          }));
          busy = false;
          schedule();
        });
      }
      receive = event => {
        if (event.source !== parent || event.origin !== location.origin || !event.data?.oneTie) return;
        pending = event.data.oneTie as Request;
        schedule();
      };
      window.addEventListener('message', receive);
      reply(0);
    })().catch(reason => {
      if (disposed) return;
      if (embedded) reply(-1);
      else error = String(reason);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(scheduled);
      if (receive) window.removeEventListener('message', receive);
      scene?.dispose();
    };
  });
</script>

<main class:repeated style:color-scheme={theme} data-ready={distance !== undefined}
  data-distance={repeated ? undefined : distance} data-spacing={repeated ? distance : undefined}>
  <div class="viewport">
    <canvas bind:this={canvas} aria-label={repeated ? 'Blitz ties along a straight segment' : 'Blitz tie banked on the sampled path'}></canvas>
    {#if geometry}
    <svg viewBox={`0 0 ${view.width} ${view.height}`} aria-hidden="true">
      <defs>{#each axisColors as color, i}
        <marker id={`axis-${i}`} markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="14" refX="15" refY="7" orient="auto"><path d="M0 0L15 7L0 14Z" fill={color}/></marker>
      {/each}
        {#each sampleColors as color, i}
          <marker id={`sample-axis-${i}`} markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="5.6" refX="15" refY="7" viewBox="0 0 15 14" orient="auto"><path d="M0 0L15 7L0 14Z" fill={color}/></marker>
        {/each}
      </defs>
      <path d={geometry.course} fill="none" stroke={ink} stroke-opacity=".38" stroke-width="2.8" />
      <g opacity=".7" fill="none" stroke-width="2.8">
        {#each geometry.glyphs as rays}
          {#each rays as ray, i}<path d={ray} stroke={sampleColors[i]} marker-end={`url(#sample-axis-${i})`}/>{/each}
        {/each}
      </g>
      {#each geometry.axes as [x, y], i}
        {@const line = `M${geometry.origin}L${x},${y}`}
        <path d={line} fill="none" stroke={bg} stroke-width="7" />
        <path d={line} fill="none" stroke={axisColors[i]} stroke-width="3.5" marker-end={`url(#axis-${i})`} />
        <text x={x + [17, -22, 17][i]} y={y + [15, -20, 4][i]} fill={ink} font-size="46">{['+X', '+Y', '−Z'][i]}</text>
      {/each}
      <circle cx={geometry.origin[0]} cy={geometry.origin[1]} r="5" stroke={bg} stroke-width="2" fill={ink}/>
    </svg>
    {/if}
  </div>
  {#if error}<p role="alert">The 3D view could not start: {error}</p>{/if}
</main>

<style>
  :global(body) { margin: 0; font: 1rem system-ui, sans-serif; }
  main { max-width: 540px; margin: auto; }
  .viewport { position: relative; aspect-ratio: 1080 / 680; }
  main.repeated { max-width: 600px; }
  .repeated .viewport { aspect-ratio: 1200 / 650; }
  canvas, svg { display: block; width: 100%; height: 100%; position: absolute; inset: 0; }
</style>
