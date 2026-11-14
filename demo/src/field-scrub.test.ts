import { test, expect } from 'bun:test';
import { scrub, scrubValue } from './field-scrub';

test('fractional scrubs stay anchored and clamp to the current bounds', () => {
  expect(scrubValue(3.125, 8, .05, 0, 12)).toBe(3.225);
  expect(scrubValue(11.99, 40, .05, 0, 12)).toBe(12);
  expect(scrubValue(.01, -40, .05, 0, 12)).toBe(0);
});

test('action reads updated callbacks, values, bounds and disabled state without a second history', () => {
  const input = { disabled: false, validity: { valid: true }, min: '0', max: '12', blur() {} };
  const label = Object.assign(new EventTarget(), {
    querySelector: () => input, classList: { add() {}, remove() {} },
    captured: false, setPointerCapture() { this.captured = true; },
    hasPointerCapture() { return this.captured; }, releasePointerCapture() { this.captured = false; },
  });
  const prior = globalThis.window;
  globalThis.window = new EventTarget() as any;
  let value = 2, commits = 0;
  const options = () => ({ value: () => value, increment: .05, preview: (v: number) => { value = v; }, commit: () => commits++ });
  const action = scrub(label as any, options());
  function send(name: string, x: number, y = 0) {
    const event = Object.assign(new Event(name, { cancelable: true }), { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true });
    label.dispatchEvent(event);
  }
  try {
    value = 3.125; action.update(options()); input.max = '3.2';
    send('pointerdown', 0); send('pointermove', 40); expect(value).toBe(3.2);
    send('pointercancel', 40); expect(commits).toBe(2); expect(label.captured).toBe(false);
    send('pointerdown', 0); send('pointermove', 1, 10); expect(label.captured).toBe(false); expect(value).toBe(3.2);
    input.disabled = true; send('pointerdown', 0); expect(label.captured).toBe(false);
    input.disabled = false; input.max = '12'; value = 5.125; action.update(options());
    send('pointerdown', 0); send('pointermove', 8); expect(value).toBe(5.225);
    send('lostpointercapture', 8); expect(label.captured).toBe(false);
  } finally { action.destroy(); globalThis.window = prior; }
});
