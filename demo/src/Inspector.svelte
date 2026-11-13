<script lang="ts">
  import { history, preview, commit, undo, redo, effective, numericRanges, compositionDefaults, compositionRanges, type Configuration } from './configuration';
  import { scrub } from './field-scrub';
  import { assemblyDefaults } from './assembly';
  import { untrack } from 'svelte';
  let { initial, changed }: { initial: Configuration; changed: (value: Configuration) => void } = $props();
  let h = $state(history(untrack(() => initial)));
  const c = $derived(h.present);
  const witnesses = untrack(() => initial.example === 'placed' || initial.example === 'repeated');
  const assetView = $derived(c.isolated || c.example === 'placed' || c.example === 'repeated');
  const composition = $derived(c.composition ?? compositionDefaults);
  const assembly = $derived(c.assembly ?? assemblyDefaults);
  const assemblyView = $derived(c.example === 'assembly');
  const compositionLabels = { x: 'X · m', y: 'Y · m', z: 'Z · m', yaw: 'Yaw · °', pitch: 'Pitch · °', roll: 'Roll · °', count: 'Count', spacing: 'Spacing · m', offset: 'Starting offset · m' };
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
  <section>
    <label>Example<select name="example" value={c.isolated ? 'witness' : c.example ?? 'track'} onchange={event => change({ ...c, isolated: event.currentTarget.value === 'witness', example: event.currentTarget.value === 'witness' ? undefined : event.currentTarget.value as Configuration['example'] }, true)}>
      <option value="track">Spine track</option><option value="assembly">Circular rails</option>{#if witnesses}<option value="placed">Placed asset witness</option><option value="repeated">Repeated asset witness</option>{/if}{#if c.isolated}<option value="witness">Source witness</option>{/if}
    </select></label>
    <label id="configuration-row" hidden={assetView || assemblyView}>Track<select name="configuration" value={c.parameters.configuration} onchange={event => change({ ...c, parameters: { ...c.parameters, configuration: event.currentTarget.value as Configuration['parameters']['configuration'] } }, true)}>
      <option value="straight">Straight</option><option value="curve">Banked curve</option><option value="loop">Vertical loop</option>
    </select></label>
    <label id="asset-row" hidden={!assetView}>Asset<select name="asset" value={c.asset} onchange={event => change({ ...c, asset: event.currentTarget.value as Configuration['asset'] }, true)}><option value="wheel-carrier">Wheel carrier</option><option value="blitz-tie">Blitz tie</option></select></label>
  </section>
  {#if assemblyView}
    <section>
      <label>Path<select name="assembly-path" value={assembly.path} onchange={event => change({ ...c, assembly: { ...assembly, path: event.currentTarget.value as typeof assembly.path } }, true)}><option value="straight">Straight</option><option value="curve">Banked curve</option><option value="loop">Recorded loop</option></select></label>
      {#if assembly.path === 'loop'}
        <label>Appearance<select name="appearance" value={c.appearance ?? 'material'} onchange={event => change({ ...c, appearance: event.currentTarget.value as Configuration['appearance'] }, true)}><option value="material">Native material</option><option value="normal-force">Normal support</option></select></label>
        {#if c.appearance === 'normal-force'}
          <figure class="force-scale"><figcaption>Normal support · g<br />Recorded motion · 1 g = 9.81 m/s²</figcaption><div class="force-ramp"></div><div class="force-ticks"><span>0</span><span>2</span><span>4</span></div></figure>
        {/if}
      {/if}
      <label>Tie<select name="assembly-tie" value={assembly.tie} onchange={event => change({ ...c, assembly: { ...assembly, tie: event.currentTarget.value as typeof assembly.tie } }, true)}><option value="assembly-tie-bar">Bar</option><option value="assembly-tie-fork">Fork</option></select></label>
      {#each (['separation', 'spacing'] as const) as key}
        <label use:scrub={{ value: () => assembly[key], preview: value => change({ ...c, assembly: { ...assembly, [key]: value } }), commit: finish }}>{key === 'separation' ? 'Rail separation · m' : 'Tie spacing · m'}<input name={'assembly-' + key} type="number" min={numericRanges[key].min} max={numericRanges[key].max} step={numericRanges[key].step} required value={assembly[key]} oninput={event => { if (event.currentTarget.validity.valid) change({ ...c, assembly: { ...assembly, [key]: event.currentTarget.valueAsNumber } }); }} onblur={event => { finish(); event.currentTarget.value = String(assembly[key]); }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(); } }} /></label>
      {/each}
    </section>
  {/if}
  {#if !c.isolated && assetView}
    <section>
      {#each (Object.keys(compositionRanges) as (keyof typeof compositionRanges)[]).filter(key => c.example === 'repeated' ? !['x', 'y', 'z'].includes(key) : !['count', 'spacing', 'offset'].includes(key)) as key}
        <label use:scrub={{ value: () => composition[key], preview: value => change({ ...c, composition: { ...composition, [key]: value } }), commit: finish }}>{compositionLabels[key]}<input name={'placement-' + key} type="number" min={compositionRanges[key][0]} max={compositionRanges[key][1]} step={compositionRanges[key][2]} required value={composition[key]} oninput={event => { if (event.currentTarget.validity.valid) change({ ...c, composition: { ...composition, [key]: event.currentTarget.valueAsNumber } }); }} onblur={event => { finish(); event.currentTarget.value = String(composition[key]); }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(); } }} /></label>
      {/each}
    </section>
  {/if}
  {#each ['ties', 'spine'] as section}
    <section id={section} hidden={assetView || assemblyView}>
      <h2>{section === 'ties' ? 'Ties' : 'Spine'}</h2>
      {#if section === 'ties'}
        <label>Type<select name="component" value={c.parameters.fixed ? 'fixed' : 'local'} disabled={c.isolated} onchange={event => change({ ...c, parameters: { ...c.parameters, fixed: event.currentTarget.value === 'fixed' } }, true)}><option value="local">Parametric</option><option value="fixed">Blitz</option></select></label>
      {/if}
      {#if section === 'spine' && c.parameters.fixed}
        <label>Assembly<select name="spineAssembly" value={c.parameters.secondSpine ? 'double' : 'single'} onchange={event => change({ ...c, parameters: { ...c.parameters, secondSpine: event.currentTarget.value === 'double' } }, true)}><option value="single">Spine 1</option><option value="double">Spines 1 + 2</option></select></label>
      {/if}
      {#each fields.filter(f => section === 'ties' ? ['spacing', 'separation'].includes(f.key) : ['width', 'depth'].includes(f.key)) as field}
        <label use:scrub={{ value: () => c.parameters[field.key], preview: value => number(field.key, value), commit: finish }}>
          {field.label}<input name={field.key} aria-label={field.key === 'separation' ? 'Gauge, rail center-to-center · m' : undefined} title={field.key === 'separation' ? 'Rail center-to-center · m' : undefined} type="number" min={field.min} max={field.max} step={field.step} required disabled={c.isolated || (field.key !== 'spacing' && c.parameters.fixed)} value={rendered.parameters[field.key]} oninput={event => { if (event.currentTarget.validity.valid) number(field.key, event.currentTarget.valueAsNumber); }} onblur={event => { finish(); event.currentTarget.value = String(rendered.parameters[field.key]); }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(); } }} />
        </label>
      {/each}
    </section>
  {/each}
  <section hidden={assetView || assemblyView}>
    <h2>Color</h2>
    {#each (['rails', 'ties', 'spine'] as const) as part}
      <label>{part[0].toUpperCase() + part.slice(1)}<input type="color" name={part + 'Color'} value={c.paint[part]} oninput={event => change({ ...c, paint: { ...c.paint, [part]: event.currentTarget.value } })} onchange={finish} onblur={finish} /></label>
    {/each}
  </section>
</form>
