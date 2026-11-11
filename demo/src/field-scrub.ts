// A label action previews plain values; the inspector remains the value owner.
export function scrub(label: HTMLLabelElement, options: { value: () => number; preview: (value: number) => void; commit: () => void }) {
  const input = label.querySelector('input')!;
  const abort = new AbortController();
  const listen = (target: EventTarget, name: string, fn: (event: any) => void) => target.addEventListener(name, fn, { signal: abort.signal });
  let drag: { id: number; x: number; y: number; value: number; active: boolean } | undefined;
  let suppress = false;
  function stop() {
    const prior = drag;
    drag = undefined;
    label.classList.remove('scrubbing');
    if (prior && label.hasPointerCapture(prior.id)) label.releasePointerCapture(prior.id);
    if (prior?.active) options.commit();
  }
  listen(label, 'pointerdown', (event: PointerEvent) => {
    if (event.target === input || input.disabled || !input.validity.valid || event.button !== 0 || !event.isPrimary) return;
    // Finish any preceding typed session before starting a label gesture.
    input.blur();
    options.commit();
    suppress = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: options.value(), active: false };
    label.setPointerCapture(event.pointerId);
  });
  listen(label, 'pointermove', (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (input.disabled) return stop();
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= 4) return stop();
      if (Math.abs(dx) < 4) return;
      drag.active = true;
      suppress = true;
      label.classList.add('scrubbing');
    }
    event.preventDefault();
    const step = Number(input.step) || 1, base = Number(input.min) || 0;
    const ticks = Math.round((drag.value - base) / step) + Math.round(dx / 4);
    options.preview(Number(Math.min(Number(input.max), Math.max(base, base + ticks * step)).toFixed(10)));
  });
  listen(label, 'click', (event: MouseEvent) => { if (suppress) { event.preventDefault(); suppress = false; } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(label, name, stop);
  listen(window, 'blur', stop);
  return { destroy() { stop(); abort.abort(); } };
}
