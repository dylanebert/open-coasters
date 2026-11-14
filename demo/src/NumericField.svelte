<script lang="ts">
  import { scrub } from './field-scrub';
  let { name, label, value, min, max, step, increment, disabled = false, ariaLabel, title, preview, commit }: {
    name: string; label: string; value: number; min: number; max: number;
    step: number | 'any'; increment: number; disabled?: boolean; ariaLabel?: string; title?: string;
    preview: (value: number) => void; commit: () => void;
  } = $props();
  function finish(input: HTMLInputElement) { commit(); input.value = String(value); }
</script>
<label use:scrub={{ value: () => value, increment, preview, commit }}>
  {label}<input {name} aria-label={ariaLabel} {title} type="number" {min} {max} {step} required {disabled} {value}
    oninput={event => { if (event.currentTarget.validity.valid) preview(event.currentTarget.valueAsNumber); }}
    onblur={event => finish(event.currentTarget)}
    onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(event.currentTarget); } }} />
</label>
