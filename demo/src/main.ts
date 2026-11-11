import { createApp, Meshes } from "@dylanebert/shallot";
import { blurCanvas } from "@dylanebert/shallot/input";
import { attachCanvas } from "@dylanebert/shallot/rendering";
import { Orbit } from "@dylanebert/shallot/extras";
import { Scene } from "./scene";
import { liveScene, type Selection } from "./live";
import { defaults, type Parameters } from "./track";
import "./style.css";
import { attachFieldScrubbing } from "./field-scrub";

try {
  const query = new URLSearchParams(location.search);
  const form = document.querySelector("form")!;
  const field = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement;
  for (const control of form.elements) {
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement
    ) {
      const value = query.get(control.name);
      if (value !== null) {
        const fallback = control.value;
        control.value = value;
        if (!control.value || !control.validity.valid) control.value = fallback;
      }
    }
  }
  const isolated = query.has("asset");
  document.querySelector<HTMLElement>("#configuration-row")!.hidden = isolated;
  if (isolated) {
    const link = document.createElement("a");
    link.href = location.pathname;
    link.textContent = "Open Coasters";
    document.querySelector("#identity")!.replaceChildren(link);
    document.querySelector("h2")!.textContent = "Asset";
  }
  let adjustableSeparation = field("separation").value;
  let wasFixed = false;
  function read(): Selection {
    const fixed = field("component").value === "fixed";
    if (fixed && !wasFixed) adjustableSeparation = field("separation").value;
    if (!fixed && wasFixed) field("separation").value = adjustableSeparation;
    if (fixed) field("separation").value = "1";
    for (const name of ["component", "spacing", "width", "depth"])
      field(name).disabled = isolated;
    field("separation").disabled = isolated || fixed;
    wasFixed = fixed;
    document.querySelector<HTMLElement>("#asset-row")!.hidden = !isolated;
    document.querySelector<HTMLElement>("#ties")!.hidden = isolated;
    document.querySelector<HTMLElement>("#spine")!.hidden = isolated;
    const parameters: Parameters = {
      ...defaults,
      configuration: isolated
        ? "curve"
        : (field("configuration").value as Parameters["configuration"]),
      fixed,
    };
    for (const key of ["spacing", "separation", "width", "depth"] as const)
      parameters[key] = field(key).validity.valid
        ? Number(field(key).value)
        : defaults[key];
    return {
      parameters,
      isolated,
      asset: field("asset").value as Selection["asset"],
    };
  }
  let pending: Selection | undefined = read();
  const live = liveScene(
    pending,
    (name) => new URL(`assets/${name}.gltf`, document.baseURI),
  );
  // Install listeners before asynchronous startup: edits made while loading are not lost.
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", () => {
    const selection = read();
    if (form.checkValidity()) pending = selection;
  });
  attachFieldScrubbing(form);
  const app = await createApp({
    plugins: [
      live.plugin,
      {
        name: "CanvasHost",
        dependencies: [live.plugin],
        initialize(world) {
          attachCanvas(
            world,
            world.resource(Scene).camera,
            document.querySelector("canvas")!,
          );
        },
      },
    ],
    pixelRatio: 1,
  });
  // Keyboard focus may enter by Tab without a pointer-down outside the canvas.
  form.addEventListener("focusin", () => blurCanvas(app.world));
  if (form.contains(document.activeElement)) blurCanvas(app.world);
  let disposed = false;
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      app.dispose();
    },
    { once: true },
  );
  // One serialized loop owns BOTH submissions and replacements. No reset can run
  // inside an open encoder. Inputs coalesce; the latest valid selection wins.
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
    Object.assign(window, {
      step: () => step(1 / 60),
      demo: {
        app,
        meshes: () =>
          [...app.world.resource(Meshes)].map((mesh) => ({
            name: mesh.name,
            indexCount: mesh.indexCount,
          })),
        get camera() {
          return app.world.resource(Scene).camera;
        },
        orbit: () => {
          const o = app.world.storage(Orbit),
            c = app.world.resource(Scene).camera;
          return {
            yaw: o.yaw.get(c),
            pitch: o.pitch.get(c),
            distance: o.distance.get(c),
            pan: [...o.pan.read(c, new Float32Array(4))],
          };
        },
      },
    });
  } else {
    let last = performance.now();
    const tick = async (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
      last = now;
      await step(dt);
      if (!disposed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  document.body.dataset.ready = "true";
} catch (error) {
  document.body.textContent = "WebGPU initialization failed. See console.";
  console.error(error);
}
