// Offline authoring spike only. Run with an explicit, clean KexEdit source checkout.
// No KexEdit code is copied; dynamic imports below execute that checkout's policies.
import { resolve } from "node:path";

const checkout = process.argv[2];
if (!checkout) throw new Error("Usage: bun demo/tools/export-loop.ts /path/to/kexedit");
const revision = "2d8745a44be2c53465509afd810f20e96a5aba14";
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["git", "-C", checkout, ...args]);
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};
if (git("rev-parse", "HEAD") !== revision) throw new Error("KexEdit revision mismatch");
if (git("diff", "HEAD", "--", "src", "package.json", "bun.lock")) throw new Error("Modified KexEdit source");
const { policy } = await import(resolve(checkout, "src/trajectory/policies.ts"));
const { step } = await import(resolve(checkout, "src/trajectory/integrator.ts"));
const { rotate } = await import(resolve(checkout, "src/path/path.ts"));
const rate = 1000, stride = 5, entrySpeed = 17.2, rollAmplitude = 0.32;
const constants = { g: 9.81, heartToCom: 0, mass: 500, friction: 0, drag: 0 };
const initial = { position: [0, 0, 0], rotation: [0, 0, 0, 1], speed: entrySpeed, distance: 0 };
const supportWidth = 1.65 * Math.PI, supportStart = (2 * Math.PI - supportWidth) / 2;
function simulate(trims: number[]) {
  const states: any[] = [initial], inputs: any[] = [], intents: any[] = [];
  const history = { rate, constants, states, inputs };
  for (let tick = 0; tick < 5000; tick++) {
    const s = states.at(-1), f = rotate(s.rotation, [0, 0, -1]), up = rotate(s.rotation, [0, 1, 0]);
    const angle = Math.atan2(f[1], -f[2]), theta = angle < 0 ? angle + 2 * Math.PI : angle;
    const x = (theta - supportStart) * Math.PI / supportWidth;
    // Derivative of a supported signed bank guide, plus two smooth roll trims.
    const ref = constants.g * (2 + up[1]) / s.speed * Math.PI / supportWidth;
    const roll = x > 0 && x < Math.PI ? -ref * (
      rollAmplitude * (Math.sin(2*x)**2 + 2*Math.sin(x)**2*Math.cos(2*x)) +
      trims[0]*Math.sin(x)**2 + trims[1]*Math.sin(x)**2*Math.cos(x)) : 0;
    const intent = { shape: { kind: "forces", normal: 2 + 2*Math.cos(theta), lateral: 0, roll }, energy: { kind: "free" } };
    const input = policy(history, intent);
    if ("reason" in input) throw new Error(JSON.stringify(input));
    const whole = step(s, input, 1/rate);
    let duration = 1/rate, next = whole;
    const terminal = tick > rate && f[1] < 0 && rotate(whole.rotation, [0,0,-1])[1] >= 0;
    if (terminal) {
      // Bounded physical event solve; rotation depends on omega, not acceleration.
      let lo = 0, hi = duration;
      for (let k = 0; k < 48; k++) {
        const mid = (lo + hi)/2;
        if (rotate(step(s, input, mid).rotation, [0,0,-1])[1] < 0) lo = mid; else hi = mid;
      }
      duration = (lo + hi)/2;
      // Recompute free energy for the ACTUAL interval, never clip a full-tick a.
      const partial = policy({ ...history, rate: 1/duration }, { shape: { kind: "rates", omega: input.omega }, energy: { kind: "free" } });
      if ("reason" in partial) throw new Error(JSON.stringify(partial));
      next = step(s, partial, duration);
      inputs.push(partial);
    } else inputs.push(input);
    intents.push(intent); states.push(next);
    if (terminal) {
      const f = rotate(next.rotation, [0,0,-1]), u = rotate(next.rotation, [0,1,0]);
      return { history, intents, duration, time: tick/rate + duration, whole,
        error: [Math.atan2(f[0], -f[2]), Math.atan2(u[0], u[1])] };
    }
  }
  throw new Error("No completed inversion");
}
let trims = [0,0], result = simulate(trims);
const shooting: any[] = [];
for (let k = 0; Math.hypot(...result.error) > 1e-7; k++) {
  if (k >= 8) throw new Error("Shooting iteration bound");
  const e = result.error, delta = 1e-4;
  const [a,b] = [0,1].map(j => { const c = [...trims]; c[j] += delta;
    return simulate(c).error.map((v,i) => (v-e[i])/delta); });
  const det = a[0]*b[1]-b[0]*a[1], fro = a[0]**2+a[1]**2+b[0]**2+b[1]**2;
  const condition = (fro + Math.sqrt(Math.max(0,fro*fro-4*det*det)))/(2*Math.abs(det));
  if (condition > 100 || Math.abs(det) < 1e-5) throw new Error("Ill-conditioned shoot");
  const change = [(e[0]*b[1]-e[1]*b[0])/det, (a[0]*e[1]-a[1]*e[0])/det];
  if (Math.hypot(...change) > 1) throw new Error("Shooting step bound");
  trims = trims.map((v,i) => v-change[i]);
  if (Math.hypot(...trims) > .8) throw new Error("Trim bound");
  shooting.push({ condition, trims }); result = simulate(trims);
}
const intents = result.intents, end = result.history.states.length - 1;
const round = (n: number) => Number(n.toFixed(10));
const indices = Array.from({ length: Math.ceil(end / stride) + 1 }, (_, i) => Math.min(i * stride, end));
const path = indices.map(i => { const s = result.history.states[i]; return [s.distance, ...s.position, ...s.rotation].map(round); });
const audit = indices.map(i => { const s = result.history.states[i], intent = intents[Math.min(i,end-1)].shape;
  return [i === end ? result.time : i/rate, s.speed, intent.normal, intent.lateral, intent.roll].map(round); });
// Audit with an explicit rotation matrix and world-velocity differences. Do not
// use KexEdit's rotate/feltForces/closure helpers as the audit oracle.
function basis(q: number[]) {
  const [x, y, z, w] = q;
  return {
    right: [1-2*(y*y+z*z), 2*(x*y+w*z), 2*(x*z-w*y)],
    up: [2*(x*y-w*z), 1-2*(x*x+z*z), 2*(y*z+w*x)],
    forward: [-2*(x*z+w*y), -2*(y*z-w*x), -1+2*(x*x+y*y)],
  };
}
let worstNormal = 0, worstLateral = 0, energyError = 0;
const states = result.history.states;
for (let i = 0; i < states.length; i++) {
  const s = states[i];
  energyError = Math.max(energyError, Math.abs(s.speed ** 2 / 2 + constants.g * s.position[1] - entrySpeed ** 2 / 2));
  // The last interior point has an asymmetric terminal stencil; the recorded
  // independent audit covers it using actual timestamps instead.
  if (i === 0 || i >= end - 1) continue;
  const velocity = (j: number) => basis(states[j].rotation).forward.map(v => v * states[j].speed);
  const a = velocity(i - 1), b = velocity(i + 1);
  const felt = b.map((v: number, j: number) => (v - a[j]) * rate / 2 + (j === 1 ? constants.g : 0));
  const dot = (v: number[]) => v.reduce((n, x, j) => n + x * felt[j], 0) / constants.g;
  worstNormal = Math.max(worstNormal, Math.abs(dot(basis(s.rotation).up) - intents[i].shape.normal));
  worstLateral = Math.max(worstLateral, Math.abs(dot(basis(s.rotation).right)));
}
const metadata = {
  source: { repository: "https://github.com/dylanebert/KexEdit", revision },
  generation: "bun demo/tools/export-loop.ts /explicit/path/to/kexedit",
  rate, recordedStride: stride, constants, initial, rollAmplitude,
  forceFloor: 5, wholeTicks: end - 1, terminalDuration: result.duration, endTime: result.time,
  supportWidth, supportStart, trims, shooting, wholeTickTerminal: result.whole,
  spike: { worstNormal, worstLateral, energyError, minSpeed: Math.min(...states.map((s: any) => s.speed)) },
  columns: ["time", "speed", "authoredNormal", "authoredLateral", "authoredRoll"],
  samples: audit,
};
await Bun.write(new URL("../src/loop-path.json", import.meta.url), JSON.stringify(path) + "\n");
await Bun.write(new URL("../fixtures/loop-state.json", import.meta.url), JSON.stringify(metadata) + "\n");
console.log({ ...metadata, samples: `${audit.length} rows`, length: path.at(-1)![0] });
