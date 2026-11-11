import { expect, test } from "bun:test";
import { loadGltf, parseGltf, type GltfJson } from "@dylanebert/shallot/gltf";
import { requireStaticInstance, staticInstanceSnapshot } from "./instance";
const json = (await Bun.file(
    new URL("../public/assets/wheel-carrier.gltf", import.meta.url),
).json()) as GltfJson;
const bin = await Bun.file(
    new URL("../public/assets/wheel-carrier.bin", import.meta.url),
).arrayBuffer();

test("snapshot retains external and data buffer resolution through public decoding", async () => {
    const snapshot = await staticInstanceSnapshot(
        new URL("../public/assets/wheel-carrier.gltf", import.meta.url),
    );
    expect(snapshot.protocol).toBe("data:");
    expect((await loadGltf(snapshot)).instances).toHaveLength(4);
    const embedded = structuredClone(json);
    embedded.buffers![0].uri = `data:application/octet-stream;base64,${Buffer.from(bin).toString("base64")}`;
    Object.assign(embedded, { extras: { label: "roue — 車輪" } });
    const source = new URL(
        `data:model/gltf+json,${encodeURIComponent(JSON.stringify(embedded))}`,
    );
    const frozen = await staticInstanceSnapshot(source);
    expect((await loadGltf(frozen)).instances).toHaveLength(4);
    embedded.animations = [{ channels: [], samplers: [] }];
    await expect(
        staticInstanceSnapshot(
            new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(embedded))}`),
        ),
    ).rejects.toThrow("animations unsupported");
});

test("explicit scene selection; authored origin, metric bounds and facing landmark", () => {
    requireStaticInstance(json);
    const scene = parseGltf(json, [bin]);
    const points = scene.instances.flatMap((i) => {
        const v = scene.meshes[i.mesh].vertices,
            m = i.matrix;
        return Array.from({ length: v.length / 8 }, (_, k) =>
            [0, 1, 2].map(
                (a) =>
                    m[a] * v[k * 8] +
                    m[4 + a] * v[k * 8 + 1] +
                    m[8 + a] * v[k * 8 + 2] +
                    m[12 + a],
            ),
        );
    });
    // Independently measured in Blender, not exporter constants or engine bounds.
    const min = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a])));
    const max = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])));
    min.forEach((n, a) => expect(n).toBeCloseTo([-0.7, 0.3, -0.6][a], 5));
    max.forEach((n, a) => expect(n).toBeCloseTo([1.2, 0.9, 0.7][a], 5));
    const nose = scene.instances.find((i) => i.node === "Positive Z nose")!;
    expect(nose.matrix[12]).toBeCloseTo(0.25);
    expect(nose.matrix[13]).toBeCloseTo(0.6);
    expect(nose.matrix[14]).toBeCloseTo(0.45);
    const alternative = structuredClone(json);
    alternative.scenes!.push({ nodes: [] });
    alternative.scene = 1;
    expect(() => requireStaticInstance(alternative)).toThrow(
        "explicit nonempty selected scene",
    );
    // Engine must select the requested scene, not merge all roots.
    expect(parseGltf(alternative, [bin]).instances.length).toBe(0);
    const selected = structuredClone(json);
    selected.nodes!.push({ mesh: 0, translation: [7, 8, 9] });
    selected.scenes!.push({ nodes: [selected.nodes!.length - 1] });
    selected.scene = 1;
    requireStaticInstance(selected);
    const only = parseGltf(selected, [bin]).instances;
    expect(only.length).toBe(1);
    expect(Array.from(only[0].matrix.slice(12, 15))).toEqual([7, 8, 9]);
});

test("selected empty subtree is refused even when another scene has geometry", () => {
    const copy = structuredClone(json);
    const root = copy.nodes!.length;
    copy.nodes!.push({ children: [root + 1] }, {});
    copy.scenes!.push({ nodes: [root] });
    copy.scene = 1;
    expect(parseGltf(copy, [bin]).instances).toHaveLength(0);
    expect(() => requireStaticInstance(copy)).toThrow("selected scene requires mesh geometry");
    copy.nodes![root + 1] = { children: [root + 2] };
    copy.nodes!.push({ mesh: 0 });
    expect(() => requireStaticInstance(copy)).not.toThrow();
    expect(parseGltf(copy, [bin]).instances).toHaveLength(1);
});

test("parent-first hierarchy preserves authored offsets", () => {
    const source: GltfJson = structuredClone(json);
    source.nodes = [
        { children: [1], translation: [2, 3, 4], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
        { mesh: 0, translation: [1, 0, 0] },
    ];
    source.scenes = [{ nodes: [0] }];
    source.scene = 0;
    const m = parseGltf(source, [bin]).instances[0].matrix;
    expect(m[12]).toBeCloseTo(2);
    expect(m[13]).toBeCloseTo(4);
    expect(m[14]).toBeCloseTo(4);
});

test("invalid cyclic hierarchy is rejected by the decoder", () => {
    const copy = structuredClone(json);
    copy.nodes = [{ children: [0], mesh: 0 }];
    copy.scenes = [{ nodes: [0] }];
    expect(() => parseGltf(copy, [bin])).toThrow("Cyclic glTF node hierarchy");
});

test("extras metadata does not acquire scene semantics", () => {
    const copy = structuredClone(json);
    const extras = {
        camera: 1,
        weights: [1],
        targets: [{}],
        skin: 0,
        extensions: { private: true },
    };
    Object.assign(copy, { extras });
    Object.assign(copy.nodes![0], { extras });
    Object.assign(copy.meshes![0].primitives[0], { extras });
    expect(() => requireStaticInstance(copy)).not.toThrow();
});

for (const [name, change, reason] of [
    [
        "missing scene",
        (j: GltfJson) => {
            delete j.scene;
        },
        "explicit nonempty selected scene",
    ],
    [
        "bad scene",
        (j: GltfJson) => {
            j.scene = 99;
        },
        "explicit nonempty selected scene",
    ],
    [
        "version",
        (j: GltfJson) => {
            j.asset!.version = "1.0";
        },
        "glTF 2.0",
    ],
    [
        "animation",
        (j: GltfJson) => {
            j.animations = [{ channels: [], samplers: [] }];
        },
        "animations unsupported",
    ],
    [
        "morph targets",
        (j: GltfJson) => {
            j.meshes![0].primitives[0].targets = [{ POSITION: 0 }];
        },
        "morph targets/weights unsupported",
    ],
    [
        "morph weights",
        (j: GltfJson) => {
            j.meshes![0].weights = [0];
        },
        "morph targets/weights unsupported",
    ],
    [
        "skin",
        (j: GltfJson) => {
            j.skins = [{ joints: [0] }];
        },
        "skinning unsupported",
    ],
    [
        "extension",
        (j: GltfJson) => {
            j.extensionsUsed = ["KHR_lights_punctual"];
        },
        "extensions unsupported",
    ],
    [
        "lines",
        (j: GltfJson) => {
            j.meshes![0].primitives[0].mode = 1;
        },
        "TRIANGLES",
    ],
    [
        "node weights",
        (j: GltfJson) => {
            j.nodes![0].weights = [0];
        },
        "morph targets/weights unsupported",
    ],
    [
        "node skin",
        (j: GltfJson) => {
            j.nodes![0].skin = 0;
        },
        "skinning unsupported",
    ],
    [
        "camera",
        (j: GltfJson) => {
            Object.assign(j.nodes![0], { camera: 0 });
        },
        "cameras unsupported",
    ],
    [
        "texture",
        (j: GltfJson) => {
            j.textures = [{ source: 0 }];
        },
        "textures/images unsupported",
    ],
    [
        "material extension",
        (j: GltfJson) => {
            Object.assign(j.materials![0], { extensions: { KHR_materials_unlit: {} } });
        },
        "extensions unsupported",
    ],
    [
        "transparent material",
        (j: GltfJson) => {
            j.materials![0].alphaMode = "BLEND";
        },
        "opaque materials",
    ],
    [
        "missing position",
        (j: GltfJson) => {
            Reflect.deleteProperty(j.meshes![0].primitives[0].attributes, "POSITION");
        },
        "POSITION required",
    ],
] as const)
    test(`refuse ${name}, not silently complete`, () => {
        const copy = structuredClone(json);
        change(copy);
        expect(() => requireStaticInstance(copy)).toThrow(reason);
    });
