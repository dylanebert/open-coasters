<script lang="ts">
  import { exampleOptions, selectExample, history, preview, commit, undo, redo, effective, numericRanges, type Configuration } from './configuration';
  import NumericField from './NumericField.svelte';
  import { straightDistanceRange } from './assembly';
  import { untrack } from 'svelte';
  import type { Selection } from './live';
  let { initial, changed }: { initial: Configuration; changed: (value: Selection) => void } = $props();
  let h = $state(history(untrack(() => initial)));
  const c = $derived(h.present);
  const selected = $derived(c.selected);
  const values = $derived(c.values);
  const pathValue = $derived(selected === 'ties' || selected === 'assembly' || selected === 'track' ? values[selected].path : undefined);
  const fields = $derived(selected === 'ties' ? [
    { key: 'spacing', name: 'assembly-spacing', label: 'Tie spacing · m', value: values.ties.spacing, ...numericRanges.spacing },
  ] : selected === 'station' ? [
    { key: 'spacing', name: 'assembly-spacing', label: 'Tie spacing · m', value: values.station.spacing, ...numericRanges.spacing },
    { key: 'start', name: 'gap-start', label: 'Gap start · m', value: values.station.start, min: straightDistanceRange.min, max: values.station.end, step: 'any' as const, increment: .05 },
    { key: 'end', name: 'gap-end', label: 'Gap end · m', value: values.station.end, min: values.station.start, max: straightDistanceRange.max, step: 'any' as const, increment: .05 },
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
    change({ ...c, values: { ...values, [selected]: { ...values[selected], [key]: next } } }, immediate);
  }
  function shortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
    event.preventDefault(); show(key === 'y' || event.shiftKey ? redo(h) : undo(h));
  }
</script>
<svelte:window onkeydown={shortcut} />
<h1 id="identity">{#if selected === 'witness'}<a href={location.pathname}>Open Coasters</a>{:else}Open Coasters{/if}</h1>
<form onsubmit={event => event.preventDefault()}>
  <section>
    <label>Example<select name="example" value={selected} onchange={event => change(selectExample(c, event.currentTarget.value), true)}>
      {#each exampleOptions as [value, label]}<option {value}>{label}</option>{/each}
      {#if selected === 'witness'}<option value="witness">Source witness</option>{/if}
    </select></label>
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
