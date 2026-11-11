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
const { run, policy } = await import(resolve(checkout, "src/trajectory/policies.ts"));
const { rotate } = await import(resolve(checkout, "src/path/path.ts"));
const rate = 1000, stride = 5, entrySpeed = 15.6, rollAmplitude = 0.32;
const constants = { g: 9.81, heartToCom: 0, mass: 500, friction: 0, drag: 0 };
const initial = { position: [0, 0, 0], rotation: [0, 0, 0, 1], speed: entrySpeed, distance: 0 };
// Author per-tick intents in a causal probe, then replay the fixed table through run().
// theta is the tangent angle in [0, 2pi), projected onto the initial vertical plane.
const intents: any[] = [];
const probe = run(initial, Array(4 * rate).fill(null), rate, constants, (history: any) => {
  const state = history.states.at(-1);
  const forward = rotate(state.rotation, [0, 0, -1]);
  const up = rotate(state.rotation, [0, 1, 0]);
  const angle = Math.atan2(forward[1], -forward[2]);
  const theta = angle < 0 ? angle + 2 * Math.PI : angle;
  const referencePitch = constants.g * (2 + up[1]) / state.speed;
  const roll = theta > Math.PI / 2 && theta < 3 * Math.PI / 2
    ? rollAmplitude * Math.sin(theta - Math.PI / 2) ** 2 * referencePitch : 0;
  const intent = { shape: { kind: "forces", normal: 2 + 2 * Math.cos(theta), lateral: 0, roll }, energy: { kind: "free" } };
  intents.push(intent);
  return policy(history, intent);
});
if (probe.refusal) throw new Error(JSON.stringify(probe.refusal));
const end = probe.history.states.findIndex((state: any, i: number, states: any[]) =>
  i > rate && rotate(state.rotation, [0, 0, -1])[1] >= 0 && rotate(states[i - 1].rotation, [0, 0, -1])[1] < 0);
if (end < 0) throw new Error("No completed inversion");
const result = run(initial, intents.slice(0, end), rate, constants);
if (result.refusal) throw new Error(JSON.stringify(result.refusal));
const round = (n: number) => Number(n.toFixed(10));
const indices = Array.from({ length: Math.ceil(end / stride) + 1 }, (_, i) => Math.min(i * stride, end));
const path = indices.map(i => {
  const s = result.history.states[i];
  return [s.distance, ...s.position, ...s.rotation].map(round);
});
const audit = indices.map(i => {
  const s = result.history.states[i];
  const intent = intents[Math.min(i, end - 1)].shape;
  return [i / rate, s.speed, intent.normal, intent.lateral, intent.roll].map(round);
});
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
  if (i === 0 || i === end) continue;
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
  forceFloor: 5, endTick: end,
  spike: { worstNormal, worstLateral, energyError, minSpeed: Math.min(...states.map((s: any) => s.speed)) },
  columns: ["time", "speed", "authoredNormal", "authoredLateral", "authoredRoll"],
  samples: audit,
};
await Bun.write(new URL("../src/loop-path.json", import.meta.url), JSON.stringify(path) + "\n");
await Bun.write(new URL("../fixtures/loop-state.json", import.meta.url), JSON.stringify(metadata) + "\n");
console.log({ ...metadata, samples: `${audit.length} rows`, length: path.at(-1)![0] });
