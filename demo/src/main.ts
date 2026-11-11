import { createApp, runApp } from "@dylanebert/shallot";
import { attachCanvas } from "@dylanebert/shallot/rendering";
import { Scene, createScene } from "./scene";
import "./style.css";
import { defaults, ties, type Parameters } from "./track";

try {
  const query = new URLSearchParams(location.search);
  const form = document.querySelector("form")!;
  for (const control of form.elements) {
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement
    ) {
      const value = query.get(control.name);
      if (value !== null) control.value = value;
    }
  }
  const value = (name: string) =>
    (form.elements.namedItem(name) as HTMLInputElement).value;
  const isolated =
    value("configuration") === "isolated" ||
    (query.has("asset") && !query.has("configuration"));
  if (isolated)
    (form.elements.namedItem("configuration") as HTMLSelectElement).value =
      "isolated";
  const fixed = value("component") === "fixed";
  const parameters: Parameters = {
    ...defaults,
    configuration: value("configuration") as Parameters["configuration"],
    fixed,
  };
  for (const key of ["spacing", "separation", "width", "depth"] as const) {
    const input = form.elements.namedItem(key) as HTMLInputElement;
    parameters[key] = input.validity.valid
      ? Number(input.value)
      : defaults[key];
  }
  if (fixed) {
    parameters.separation = 1;
    (form.elements.namedItem("separation") as HTMLInputElement).value = "1";
    (form.elements.namedItem("separation") as HTMLInputElement).readOnly = true;
  }
  // A navigation replaces the whole app: GPU resources cannot accumulate over rebuilds.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = new URLSearchParams(
      new FormData(form) as unknown as Record<string, string>,
    );
    if (query.has("stepped")) next.set("stepped", "");
    location.search = next.toString();
  });
  const asset = isolated ? value("asset") : "blitz-tie";
  document.querySelector("#explanation")!.textContent = isolated
    ? "Two rigid isolated instances; these remain narrow asset witnesses."
    : fixed
      ? "Fixed Blitz ties: rail separation stays at the demo’s 1 m placement. Spacing and spine dimensions still change. The source tie is never scaled."
      : "Adjustable provisional ties follow rail separation. Spacing is measured along the centerline; width and depth affect only the spine. Rails have a fixed 65 mm radius.";
  if (!isolated)
    document.querySelector("#summary")!.textContent =
      `${ties(parameters).length} ties · ${parameters.configuration} · meters`;
  const scene = createScene(
    new URL(`assets/${asset}.gltf`, document.baseURI),
    isolated ? undefined : parameters,
  );
  const stepped = new URLSearchParams(location.search).has("stepped");
  const app = await (stepped ? createApp : runApp)({
    plugins: [
      scene,
      {
        name: "CanvasHost",
        dependencies: [scene],
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
  window.addEventListener("pagehide", () => app.dispose(), { once: true });
  if (stepped) {
    (window as unknown as { step: () => Promise<void> }).step = async () => {
      app.world.step(1 / 60);
      await app.world.frameFence;
    };
    app.world.step(0);
    await app.world.frameFence;
  }
  document.body.dataset.ready = "true";
} catch (error) {
  document.body.textContent = "WebGPU initialization failed. See console.";
  console.error(error);
}
