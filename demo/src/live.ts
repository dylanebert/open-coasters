import {
  Materials,
  Meshes,
  MeshInstance,
  MeshMaterial,
  StandardMaterial,
  Transform,
  type Plugin,
  type World,
} from "@dylanebert/shallot";
import type { MaterialHandle } from "@dylanebert/shallot/standard/rendering";
import { MeshPlugin } from "@dylanebert/shallot/mesh";
import { loadGltf } from "@dylanebert/shallot/gltf";
import {
  composeMat4,
  decomposeMat4,
  multiplyMat4,
} from "@dylanebert/shallot/utils";
import { OrbitPlugin } from "@dylanebert/shallot/extras";
import { Grid, GridPlugin } from "@dylanebert/shallot-grid";
import { initializeView, Scene } from "./scene";
import { placements, staticInstanceSnapshot } from "./instance";
import { generate, ties, rotation, type Parameters } from "./track";
import { linearColor, initialConfiguration, type Paint } from "./configuration";

export type Selection = {
  parameters: Parameters;
  isolated: boolean;
  asset: "blitz-tie" | "wheel-carrier";
  paint?: Paint;
};
type Placement = {
  translation: readonly [number, number, number];
  rotation?: readonly [number, number, number, number];
};

/** The caller serializes updates BETWEEN completed frames. Static validated CPU data
 * and material registrations outlive the public whole-mesh-plugin reset. */
export function liveScene(initial: Selection, assetUrl: (name: string) => URL) {
  let world: World;
  const assets = new Map<string, Awaited<ReturnType<typeof cacheAsset>>>();
  const paintHandles = {} as Record<keyof Paint, MaterialHandle>;
  let previous: Selection | undefined;
  function paint(colors: Paint) {
    for (const part of ["rails", "ties", "spine"] as const)
      world.resource(Materials).update(paintHandles[part], { baseColor: linearColor(colors[part]) });
  }
  async function cacheAsset(name: string) {
    const data = await loadGltf(await staticInstanceSnapshot(assetUrl(name)));
    if (data.unsupported.length)
      throw new Error(`Unsupported glTF: ${data.unsupported.join(", ")}`);
    // The contribution gate excludes images, animation, skins and non-opaque modes.
    // Register only material variants used by these immutable static instances, once.
    const materials = new Map<string, MaterialHandle>();
    const primitives = data.instances.map((instance) => {
      const mesh = data.meshes[instance.mesh];
      const source = data.materials[mesh.material];
      const scale = decomposeMat4(instance.matrix).subarray(7, 10);
      const inverted = scale[0] * scale[1] * scale[2] < 0;
      const key = `${mesh.material}:${inverted}`;
      if (!materials.has(key))
        materials.set(
          key,
          world.resource(Materials).add(
            StandardMaterial({
              baseColor: source?.color ?? [1, 1, 1, 1],
              metallic: source?.metallic ?? 1,
              perceptualRoughness: source?.roughness ?? 1,
              emissive: source?.emissive ?? [0, 0, 0],
              doubleSided: source?.doubleSided ?? false,
              unlit: source?.unlit ?? false,
            }),
            {
              cullMode: source?.doubleSided
                ? "none"
                : inverted
                  ? "front"
                  : "back",
            },
          ),
        );
      return { ...instance, material: materials.get(key)! };
    });
    return { data, primitives };
  }
  function place(name: string, positions: readonly Placement[], override?: MaterialHandle) {
    const cached = assets.get(name)!;
    const handles = cached.data.meshes.map((mesh) =>
      world.resource(Meshes).add(mesh),
    );
    for (const placement of positions) {
      const matrix = composeMat4(
        ...placement.translation,
        ...(placement.rotation ?? [0, 0, 0, 1]),
        1,
        1,
        1,
      );
      const entities = cached.primitives.map((primitive) => {
        const composed = multiplyMat4(matrix, primitive.matrix);
        const t = decomposeMat4(composed);
        const rebuilt = composeMat4(
          t[0],
          t[1],
          t[2],
          t[3],
          t[4],
          t[5],
          t[6],
          t[7],
          t[8],
          t[9],
        );
        if (
          composed.some(
            (value, i) =>
              !Number.isFinite(value) ||
              Math.abs(value - rebuilt[i]) >
                1e-5 * Math.max(1, Math.abs(value)),
          )
        )
          throw new Error(
            `Static instance ${primitive.node}: non-TRS transform`,
          );
        const eid = world.create();
        world.add(eid, Transform, {
          translation: [t[0], t[1], t[2]],
          rotation: [t[3], t[4], t[5], t[6]],
          scale: [t[7], t[8], t[9]],
        });
        world.add(eid, MeshInstance, { mesh: handles[primitive.mesh] });
        world.add(eid, MeshMaterial, override ?? primitive.material);
        return eid;
      });
      world.resource(Scene).instances.push(entities);
    }
  }
  async function update(selection: Selection) {
    if (!selection.isolated) paint(selection.paint ?? initialConfiguration.paint);
    const geometry = (s: Selection) => JSON.stringify([s.parameters, s.isolated, s.asset]);
    if (previous && geometry(previous) === geometry(selection)) { previous = selection; return; }
    previous = selection;
    const refs = world.resource(Scene);
    for (const group of refs.instances)
      for (const entity of group) world.destroy(entity);
    refs.instances = [];
    // Public lifecycle resets packed families AND re-stages the default cube.
    // The demo owns the entire registry; no other mesh producer is installed.
    await MeshPlugin.initialize!(world);
    const { parameters, isolated, asset } = selection;
    if (!isolated) {
      const mesh = generate(parameters);
      for (const part of mesh.parts) {
        if (part.index === part.endIndex) continue;
        const eid = world.create();
        world.add(eid, Transform);
        world.add(eid, MeshInstance, { mesh: world.resource(Meshes).add({
          name: `Track ${part.name}`,
          vertices: mesh.vertices.subarray(part.vertex * 8, part.endVertex * 8),
          indices: mesh.indices.slice(part.index, part.endIndex).map(i => i - part.vertex),
        }) });
        world.add(eid, MeshMaterial, paintHandles[part.name]);
        refs.instances.push([eid]);
      }
    }
    if (isolated || parameters.fixed)
      place(
        isolated ? asset : "blitz-tie",
        isolated
          ? placements
          : ties(parameters).map((f) => ({
              translation: f.p,
              rotation: rotation(f),
            })),
        isolated ? undefined : paintHandles.ties,
      );
  }
  const plugin: Plugin = {
    name: "LiveScene",
    dependencies: [OrbitPlugin, GridPlugin],
    async initialize(w) {
      world = w;
      initializeView(world, initial.isolated ? undefined : initial.parameters.configuration);
      const refs = world.resource(Scene);
      world.storage(Grid).opacity.set(refs.grid, 0.12);
      for (const part of ["rails", "ties", "spine"] as const)
        paintHandles[part] = world.resource(Materials).add(StandardMaterial({
          baseColor: linearColor((initial.paint ?? initialConfiguration.paint)[part]),
          metallic: 0.4,
          perceptualRoughness: 0.35,
        }));
      for (const name of ["blitz-tie", "wheel-carrier"])
        assets.set(name, await cacheAsset(name));
      await update(initial);
    },
  };
  return { plugin, update };
}
