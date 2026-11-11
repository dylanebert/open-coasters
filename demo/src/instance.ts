import type { GltfJson } from "@dylanebert/shallot/gltf";

/** Contribution-subset gate, NOT a glTF validator. Run Khronos validation separately. */
export function requireStaticInstance(json: GltfJson): void {
    const refuse = (reason: string): never => {
        throw new Error(`Static instance: ${reason}`);
    };
    if (json.asset?.version !== "2.0") refuse("requires glTF 2.0");
    if (!Number.isInteger(json.scene) || !json.scenes?.[json.scene!]?.nodes?.length)
        refuse("explicit nonempty selected scene required");
    if (json.animations?.length) refuse("animations unsupported");
    if (json.skins?.length) refuse("skinning unsupported");
    if ("cameras" in json) refuse("cameras unsupported");
    if (json.textures?.length || json.images?.length) refuse("textures/images unsupported");
    if (json.extensionsRequired?.length || json.extensionsUsed?.length)
        refuse("extensions unsupported");

    // Inspect schema-owned locations throughout the contribution, not arbitrary extras.
    const extensions = (value: unknown): void => {
        if (
            value &&
            typeof value === "object" &&
            "extensions" in value &&
            Object.keys(value.extensions ?? {}).length
        )
            refuse("extensions unsupported");
    };
    extensions(json);
    extensions(json.asset);
    for (const items of [
        json.scenes,
        json.nodes,
        json.buffers,
        json.bufferViews,
        json.accessors,
        json.samplers,
        json.materials,
        json.meshes,
    ])
        for (const item of items ?? []) extensions(item);
    for (const accessor of json.accessors ?? []) {
        extensions(accessor.sparse);
        extensions(accessor.sparse?.indices);
        extensions(accessor.sparse?.values);
    }
    for (const node of json.nodes ?? []) {
        if (node.weights !== undefined) refuse("morph targets/weights unsupported");
        if (node.skin !== undefined) refuse("skinning unsupported");
        if ("camera" in node) refuse("cameras unsupported");
    }
    for (const mesh of json.meshes ?? []) {
        if (mesh.weights !== undefined) refuse("morph targets/weights unsupported");
        for (const p of mesh.primitives) {
            extensions(p);
            if (p.targets !== undefined) refuse("morph targets/weights unsupported");
            if (p.attributes.JOINTS_0 !== undefined || p.attributes.WEIGHTS_0 !== undefined)
                refuse("skinning unsupported");
            if ((p.mode ?? 4) !== 4) refuse("only TRIANGLES supported");
            if (p.attributes.POSITION === undefined) refuse("POSITION required");
        }
    }
    // Empty grouping nodes are allowed, but only selected descendants contribute.
    const visited = new Set<number>();
    const pending = [...json.scenes![json.scene!].nodes!];
    let geometry = false;
    while (pending.length) {
        const index = pending.pop()!;
        if (visited.has(index)) continue; // Hierarchy validity belongs to the decoder.
        visited.add(index);
        const node = json.nodes?.[index];
        if (!node) continue;
        pending.push(...(node.children ?? []));
        const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
        if (
            mesh?.primitives.some((p) => {
                const positions = json.accessors?.[p.attributes.POSITION]?.count ?? 0;
                const count =
                    p.indices === undefined
                        ? positions
                        : (json.accessors?.[p.indices]?.count ?? 0);
                return positions > 0 && count >= 3;
            })
        )
            geometry = true;
    }
    if (!geometry) refuse("selected scene requires mesh geometry");

    for (const material of json.materials ?? []) {
        extensions(material.pbrMetallicRoughness);
        for (const info of [
            material.normalTexture,
            material.occlusionTexture,
            material.emissiveTexture,
            material.pbrMetallicRoughness?.baseColorTexture,
            material.pbrMetallicRoughness?.metallicRoughnessTexture,
        ]) {
            if (info) refuse("textures/images unsupported");
        }
        if (material.alphaMode && material.alphaMode !== "OPAQUE")
            refuse("only opaque materials supported");
    }
}

/** Freeze the accepted document; Shallot must not refetch the mutable source URL. */
export async function staticInstanceSnapshot(url: URL): Promise<URL> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Instance load failed: ${response.status}`);
    const json = (await response.json()) as GltfJson;
    requireStaticInstance(json);
    const base = response.url || url.href;
    for (const buffer of json.buffers ?? []) {
        if (buffer.uri) buffer.uri = new URL(buffer.uri, base).href;
    }
    return new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`);
}

export const placements = [
    { translation: [-1.5, 0, 0] as [number, number, number] },
    {
        translation: [1.5, 0, 0] as [number, number, number],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number, number],
    },
];
