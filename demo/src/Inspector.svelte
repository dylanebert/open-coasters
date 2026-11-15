<script lang="ts">
  import { exampleOptions, selectExample, history, preview, commit, undo, redo, effective, numericRanges, setPath, type Configuration } from './configuration';
  import NumericField from './NumericField.svelte';
  import { length } from './track';
  import { straightDistanceRange } from './assembly';
  import { untrack, tick } from 'svelte';
  import type { Selection } from './live';
  let { initial, changed }: { initial: Configuration; changed: (value: Selection) => void } = $props();
  let h = $state(history(untrack(() => initial)));
  const c = $derived(h.present);
  const selected = $derived(c.selected);
  const values = $derived(c.values);
  const pathValue = $derived(selected === 'ties' || selected === 'station' || selected === 'assembly' || selected === 'track' ? values[selected].path : undefined);
  const fields = $derived(selected === 'ties' ? [
    { key: 'spacing', name: 'assembly-spacing', label: 'Tie spacing · m', value: values.ties.spacing, ...numericRanges.spacing },
  ] : selected === 'station' ? [
    { key: 'spacing', name: 'assembly-spacing', label: 'Tie spacing · m', value: values.station.spacing, ...numericRanges.spacing },
    { key: 'start', name: 'gap-start', label: 'Gap start · m', value: values.station.start, min: straightDistanceRange.min, max: values.station.end, step: 'any' as const, increment: .05 },
    { key: 'end', name: 'gap-end', label: 'Gap end · m', value: values.station.end, min: values.station.start, max: length(values.station.path), step: 'any' as const, increment: .05 },
  ] : selected === 'supports' ? [
    { key: 'post1', name: 'assembly-post1', label: 'Support 1 from start · m', value: values.supports.post1, ...straightDistanceRange, step: 'any' as const, increment: .05 },
    { key: 'post2', name: 'assembly-post2', label: 'Support 2 from start · m', value: values.supports.post2, ...straightDistanceRange, step: 'any' as const, increment: .05 },
  ] : selected === 'assembly' ? [
    { key: 'separation', name: 'assembly-separation', label: 'Rail separation · m', value: values.assembly.separation, ...numericRanges.separation },
  ] : []);
  function show(next: typeof h) { h = next; changed(effective(h.present)); }
  function finish() { h = commit(h); }
  function change(next: Configuration, immediate = false) { show(preview(h, next)); if (immediate) finish(); }
  function value(key: string, next: number | string | boolean, immediate = false) {
    if (key === 'path') { change(setPath(c, next as typeof values.station.path), true); return; }
    change({ ...c, values: { ...values, [selected]: { ...values[selected], [key]: next } } }, immediate);
  }
  function shortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
    event.preventDefault(); show(key === 'y' || event.shiftKey ? redo(h) : undo(h));
  }
  let open = $state(false);
  let picker: HTMLElement;
  function close() {
    if (picker.querySelector('.examples')?.contains(document.activeElement)) picker.querySelector<HTMLButtonElement>('.current')?.focus();
    open = false;
  }
  function choose(id: string) { close(); change(selectExample(c, id), true); }
  async function navigate(event: KeyboardEvent) {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    open = true; await tick();
    const buttons = Array.from(picker.querySelectorAll<HTMLButtonElement>('.examples button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0 ? Math.max(0, exampleOptions.findIndex(([id]) => id === selected)) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  function step(direction: number) {
    const index = exampleOptions.findIndex(([id]) => id === selected);
    choose(exampleOptions[(index + direction + exampleOptions.length) % exampleOptions.length][0]);
  }
</script>
<svelte:window onclick={event => { if (open && !picker.contains(event.target as Node)) open = false; }} onkeydown={event => { if (open && event.key === 'Escape') { close(); event.preventDefault(); } else shortcut(event); }} />
<section class="picker" bind:this={picker} aria-label="Examples">
  {#if open}<div id="example-list" class="examples">
    {#each exampleOptions as [id, label]}<button onkeydown={navigate} onmousedown={event => event.preventDefault()} aria-current={selected === id ? 'true' : undefined} onclick={() => choose(id)}>{label}</button>{/each}
  </div>{/if}
  <nav aria-label="Example navigation">
    <button onmousedown={event => event.preventDefault()} aria-label="Previous example" onclick={() => step(-1)}>&lt;</button>
    <button onkeydown={navigate} onmousedown={event => event.preventDefault()} class="current" aria-label="Example" aria-controls="example-list" aria-expanded={open} onclick={() => open = !open}>{exampleOptions.find(([id]) => id === selected)?.[1] ?? 'Source witness'}</button>
    <button onmousedown={event => event.preventDefault()} aria-label="Next example" onclick={() => step(1)}>&gt;</button>
  </nav>
</section>
<h1 id="identity">{#if selected === 'witness'}<a href={location.pathname}>Open Coasters</a>{:else}Open Coasters{/if}</h1>
<form onsubmit={event => event.preventDefault()}>
  <section>
    {#if pathValue !== undefined}
      <label>Path<select name={selected === 'track' ? 'configuration' : 'assembly-path'} value={pathValue} onchange={event => value('path', event.currentTarget.value, true)}>
        <option value="straight">Straight</option><option value="curve">Banked curve</option><option value="loop">Recorded loop</option>
      </select></label>
    {/if}
    {#if selected === 'witness'}
      <label>Asset<select name="asset" value={values.witness.asset} onchange={event => value('asset', event.currentTarget.value, true)}><option value="wheel-carrier">Wheel carrier</option><option value="blitz-tie">Blitz tie</option></select></label>
    {/if}
  </section>
  {#if fields.length}
    <section>
      {#each fields as field (field.name)}
        <NumericField name={field.name} label={field.label} value={field.value} min={field.min} max={field.max} step={field.step} increment={field.increment} preview={next => value(field.key, next)} commit={finish} />
      {/each}
    </section>
  {/if}
  {#if selected === 'track'}
    <section><label>Spine composition<select name="spineAssembly" value={values.track.secondSpine ? 'double' : 'single'} onchange={event => value('secondSpine', event.currentTarget.value === 'double', true)}><option value="single">Spine 1</option><option value="double">Spines 1 + 2</option></select></label></section>
  {/if}
</form>
