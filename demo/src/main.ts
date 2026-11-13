import { createApp, Meshes, Transform, shallotDark } from "@dylanebert/shallot";
import type { Mesh, MeshData } from "@dylanebert/shallot/mesh";
import { blurCanvas } from "@dylanebert/shallot/input";
import { worldToViewport, attachCanvas } from "@dylanebert/shallot/rendering";
import { Orbit } from "@dylanebert/shallot/extras";
import { mount, unmount } from "svelte";
import Inspector from "./Inspector.svelte";
import { initialConfiguration, effective, numericRanges, type Configuration } from "./configuration";
import { Scene } from "./scene";
import { liveScene, type Selection } from "./live";

const bootstrap = document.querySelector<HTMLElement>("[data-shallot-bootstrap]")!;
const loading = shallotDark({ container: document.body, bootstrap });
let inspector: ReturnType<typeof mount> | undefined;
try {
  const query = new URLSearchParams(location.search);
  const initial: Configuration = structuredClone(initialConfiguration);
  initial.isolated = query.has("asset");
  if (!initial.isolated && ['assembly', 'placed', 'repeated'].includes(query.get('example')!)) initial.example = query.get('example') as Configuration['example'];
  if (["blitz-tie", "wheel-carrier"].includes(query.get("asset")!)) initial.asset = query.get("asset") as Configuration['asset'];
  if (["straight", "curve", "loop"].includes(query.get("configuration")!)) initial.parameters.configuration = query.get("configuration") as Configuration['parameters']['configuration'];
  if (["local", "fixed"].includes(query.get("component")!)) initial.parameters.fixed = query.get("component") === "fixed";
  for (const key of Object.keys(numericRanges) as (keyof typeof numericRanges)[]) {
    const { min, max, step } = numericRanges[key];
    const value = Number(query.get(key));
    if (query.has(key) && Number.isFinite(value) && value >= min && value <= max && Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-7) initial.parameters[key] = value;
  }
  let pending: Selection | undefined = effective(initial);
  const canvas = document.querySelector('canvas')!;
  const live = liveScene(pending, name => new URL(`assets/${name}.gltf`, document.baseURI), () => canvas.clientWidth / canvas.clientHeight);
  // Mount before async startup: the model, not the DOM, owns pending edits.
  inspector = mount(Inspector, { target: document.querySelector("aside")!, props: { initial, changed: (value: Configuration) => { pending = value; } } });
  const app = await createApp({
    loading,
    plugins: [live.plugin, {
      name: "CanvasHost", dependencies: [live.plugin],
      initialize(world) { attachCanvas(world, world.resource(Scene).camera, document.querySelector("canvas")!); },
    }], pixelRatio: 1,
  });
  const form = document.querySelector("form")!;
  const focused = () => blurCanvas(app.world);
  form.addEventListener("focusin", focused);
  if (form.contains(document.activeElement)) focused();
  let disposed = false;
  window.addEventListener("pagehide", () => {
    disposed = true;
    form.removeEventListener("focusin", focused);
    if (inspector) void unmount(inspector);
    app.dispose();
  }, { once: true });
  let serial = Promise.resolve();
  function step(dt: number) {
    serial = serial.then(async () => {
      if (disposed) return;
      await app.world.frameFence;
      if (pending) {
        await app.world.gpu.device.queue.onSubmittedWorkDone();
        if (disposed) return;
        const selection = pending;
        pending = undefined;
        await live.update(selection);
      }
      if (disposed) return;
      app.world.step(dt);
      await app.world.frameFence;
    });
    return serial;
  }
  await step(0);
  if (query.has("stepped")) {
    // Test-only positions from subsequent track registration inputs.
    // Keep only the current assembly's raw positions, not a computed target.
    const trackPositions: { name: string; positions: number[] }[] = [];
    const meshes = app.world.resource(Meshes), add = meshes.add.bind(meshes);
    meshes.add = (mesh: MeshData | Mesh) => {
      const handle = mesh.vertices instanceof Float32Array ? add(mesh as MeshData) : add(mesh as Mesh);
      if (mesh.vertices instanceof Float32Array && (mesh.name.startsWith("Track ") || mesh.name === "Circular rails")) {
        if (mesh.name === "Track rails" || mesh.name === "Circular rails") trackPositions.length = 0;
        trackPositions.push({ name: mesh.name, positions: Array.from(mesh.vertices).filter((_, i) => i % 8 < 3) });
      }
      return handle;
    };
    Object.assign(window, { step: (dt = 1 / 60) => step(dt), demo: {
      app,
      trackPositions: () => trackPositions,
      meshes: () => [...app.world.resource(Meshes)].map(mesh => ({ name: mesh.name, indexCount: mesh.indexCount })),
      project: (point: [number, number, number]) => worldToViewport(app.world, app.world.resource(Scene).camera, point),
      instances: () => {
        const transforms = app.world.storage(Transform);
        return app.world.resource(Scene).instances.map(group => group.map(entity => ({
          translation: [transforms.translation.x.get(entity), transforms.translation.y.get(entity), transforms.translation.z.get(entity)],
          scale: [transforms.scale.x.get(entity), transforms.scale.y.get(entity), transforms.scale.z.get(entity)],
        })));
      },
      get camera() { return app.world.resource(Scene).camera; },
      orbit: () => {
        const o = app.world.storage(Orbit), c = app.world.resource(Scene).camera;
        return { yaw: o.yaw.get(c), pitch: o.pitch.get(c), distance: o.distance.get(c), pan: [...o.pan.read(c, new Float32Array(4))] };
      },
    } });
  } else {
    let last = performance.now();
    const tick = async (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, .1));
      last = now;
      await step(dt);
      if (!disposed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  document.body.dataset.ready = "true";
} catch (error) {
  if (inspector) void unmount(inspector);
  bootstrap.remove();
  loading.error?.(error);
  console.error(error);
}
