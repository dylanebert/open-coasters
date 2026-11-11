// Keep native inputs as the sole value and event owner; only labels scrub.
export function attachFieldScrubbing(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
    const label = input.closest("label")!;
    let drag: { id: number; x: number; y: number; value: number; active: boolean } | undefined;
    let suppressClick = false;
    const stop = () => {
      const prior = drag;
      drag = undefined;
      label.classList.remove("scrubbing");
      if (prior && label.hasPointerCapture(prior.id)) label.releasePointerCapture(prior.id);
    };
    label.addEventListener("pointerdown", (event) => {
      if (event.target === input || input.disabled || !input.validity.valid || event.button !== 0 || !event.isPrimary) return;
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: input.valueAsNumber, active: false };
      label.setPointerCapture(event.pointerId);
    });
    label.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (input.disabled) return stop();
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= 4) return stop();
        if (Math.abs(dx) < 4) return;
        drag.active = true;
        suppressClick = true;
        label.classList.add("scrubbing");
      }
      event.preventDefault();
      const step = Number(input.step) || 1;
      const base = input.min ? Number(input.min) : Number(input.defaultValue) || 0;
      const min = input.min ? Number(input.min) : -Infinity;
      const max = input.max ? Number(input.max) : Infinity;
      const ticks = Math.round((drag.value - base) / step) + Math.round(dx / 4);
      const value = Number(Math.min(max, Math.max(min, base + ticks * step)).toFixed(10));
      if (value !== input.valueAsNumber) {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    label.addEventListener("click", (event) => {
      if (suppressClick) { event.preventDefault(); suppressClick = false; }
    });
    label.addEventListener("pointerup", stop);
    label.addEventListener("pointercancel", stop);
    label.addEventListener("lostpointercapture", stop);
    window.addEventListener("blur", stop);
  }
}
