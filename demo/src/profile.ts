import { loadGltf, type GltfJson, type GltfMaterial } from "@dylanebert/shallot/gltf";
import { prepareProfileDocument, recoverProfile, type Profile as CoreProfile } from "../../profile";
export { profileTolerance, type Point, type ProfileEdge } from "../../profile";
export type Profile = CoreProfile<GltfMaterial>;

/** Transport, native glTF decoding and renderer material conversion for the demo. */
export async function loadProfile(url: URL): Promise<Profile> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Profile: fetch ${response.status}`);
  const json = await response.json() as GltfJson;
  prepareProfileDocument(json);
  for (const buffer of json.buffers ?? []) if (buffer.uri)
    buffer.uri = new URL(buffer.uri, response.url || url.href).href;
  const scene = await loadGltf(new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`));
  if (scene.unsupported.length) throw new Error(`Profile: ${scene.unsupported.join(", ")}`);
  return recoverProfile(scene.instances.map(instance => {
    const mesh = scene.meshes[instance.mesh];
    const positions: number[] = [], normals: number[] = [];
    for (let i = 0; i < mesh.vertices.length; i += 8) {
      positions.push(...mesh.vertices.slice(i, i + 3));
      normals.push(...mesh.vertices.slice(i + 4, i + 7));
    }
    return { positions, normals, indices: mesh.indices, material: mesh.material };
  }), scene.materials);
}
