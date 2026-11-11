<script lang="ts">
  import { history, preview, commit, undo, redo, effective, numericRanges, type Configuration } from './configuration';
  import { scrub } from './field-scrub';
  import { untrack } from 'svelte';
  let { initial, changed }: { initial: Configuration; changed: (value: Configuration) => void } = $props();
  let h = $state(history(untrack(() => initial)));
  const c = $derived(h.present);
  const rendered = $derived(effective(c));
  const fields = [
    { key: 'spacing', label: 'Spacing · m', ...numericRanges.spacing },
    { key: 'separation', label: 'Gauge · m', ...numericRanges.separation },
    { key: 'width', label: 'Width · m', ...numericRanges.width },
    { key: 'depth', label: 'Depth · m', ...numericRanges.depth },
  ] as const;
  function show(next: typeof h) { h = next; changed(effective(h.present)); }
  function finish() { h = commit(h); }
  function change(next: Configuration, immediate = false) {
    show(preview(h, next));
    if (immediate) finish();
  }
  function number(key: typeof fields[number]['key'], value: number) {
    change({ ...c, parameters: { ...c.parameters, [key]: value } });
  }
  function shortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
    // Native selection and typing stay native, but undo/redo operate on this
    // inspector's session (including its live preview), not stale DOM values.
    event.preventDefault();
    show(key === 'y' || event.shiftKey ? redo(h) : undo(h));
  }
</script>

<svelte:window onkeydown={shortcut} />
<h1 id="identity">{#if c.isolated}<a href={location.pathname}>Open Coasters</a>{:else}Open Coasters{/if}</h1>
<form onsubmit={event => event.preventDefault()}>
  <div class="history-actions">
    <button type="button" disabled={!commit(h).past.length} onclick={() => show(undo(h))}>Undo</button>
    <button type="button" disabled={!commit(h).future.length} onclick={() => show(redo(h))}>Redo</button>
  </div>
  <section>
    <h2>{c.isolated ? 'Asset' : 'Configuration'}</h2>
    <label id="configuration-row" hidden={c.isolated}>Track<select name="configuration" value={c.parameters.configuration} onchange={event => change({ ...c, parameters: { ...c.parameters, configuration: event.currentTarget.value as Configuration['parameters']['configuration'] } }, true)}>
      <option value="straight">Straight</option><option value="curve">Banked curve</option><option value="loop">Vertical loop</option>
    </select></label>
    <label id="asset-row" hidden={!c.isolated}>Asset<select name="asset" value={c.asset} onchange={event => change({ ...c, asset: event.currentTarget.value as Configuration['asset'] }, true)}><option value="wheel-carrier">Wheel carrier</option><option value="blitz-tie">Blitz tie</option></select></label>
  </section>
  {#each ['ties', 'spine'] as section}
    <section id={section} hidden={c.isolated}>
      <h2>{section === 'ties' ? 'Ties' : 'Spine'}</h2>
      {#if section === 'ties'}
        <label>Type<select name="component" value={c.parameters.fixed ? 'fixed' : 'local'} disabled={c.isolated} onchange={event => change({ ...c, parameters: { ...c.parameters, fixed: event.currentTarget.value === 'fixed' } }, true)}><option value="local">Adjustable</option><option value="fixed">Blitz</option></select></label>
      {/if}
      {#each fields.filter(f => section === 'ties' ? ['spacing', 'separation'].includes(f.key) : ['width', 'depth'].includes(f.key)) as field}
        <label use:scrub={{ value: () => c.parameters[field.key], preview: value => number(field.key, value), commit: finish }}>
          {field.label}<input name={field.key} aria-label={field.key === 'separation' ? 'Gauge, rail center-to-center · m' : undefined} title={field.key === 'separation' ? 'Rail center-to-center · m' : undefined} type="number" min={field.min} max={field.max} step={field.step} required disabled={c.isolated || (field.key === 'separation' && c.parameters.fixed)} value={rendered.parameters[field.key]} oninput={event => { if (event.currentTarget.validity.valid) number(field.key, event.currentTarget.valueAsNumber); }} onblur={event => { finish(); event.currentTarget.value = String(rendered.parameters[field.key]); }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(); } }} />
        </label>
      {/each}
    </section>
  {/each}
  <section hidden={c.isolated}>
    <h2>Paint</h2>
    {#each (['rails', 'ties', 'spine'] as const) as part}
      <label>{part[0].toUpperCase() + part.slice(1)}<input type="color" name={part + 'Color'} value={c.paint[part]} oninput={event => change({ ...c, paint: { ...c.paint, [part]: event.currentTarget.value } })} onchange={finish} onblur={finish} /></label>
    {/each}
  </section>
</form>
