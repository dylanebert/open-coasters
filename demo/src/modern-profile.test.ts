import { expect, test } from "bun:test";
const archive = new URL("../../assets/blitz-profile/", import.meta.url);
test("archive matches pinned KexEdit Git blobs, including source style evidence", async () => {
  const blobs = {
    "Modern.json": "922921d47d7b976f2edbd7df01a101172042c777",
    "ModernRail.obj": "1ef725405a27b8d9dc3be3da66707b3e9c76a1bd",
    "ModernSpine_1.obj": "8e091c620f1f3ca5de4765a00b821b3e0b2d915a",
    "ModernSpine_2.obj": "cb39998445278902d5a25dced6a4c53196d38765",
    "ModernTie_Med.obj": "6d43c0455ab0f6e84ff2b975201d7660a7654c2d",
    "ModernTie_Dense.obj": "73e3fc0531b95c1ce035216860143ee355bafcf2",
  };
  for (const [name, hash] of Object.entries(blobs)) {
    const bytes = await Bun.file(new URL(name, archive)).bytes();
    expect(new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(hash);
  }
  const style = await Bun.file(new URL("Modern.json", archive)).json();
  expect(style.DefaultStyle).toBe(1);
  expect(style.Styles[1].DuplicationMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernTie_Med.obj"]);
  expect(style.Styles[1].ExtrusionMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernRail.obj", "ModernSpine_1.obj"]);
  expect(style.Styles[2].ExtrusionMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernRail.obj", "ModernSpine_1.obj", "ModernSpine_2.obj"]);
  expect(style.Styles[2].DuplicationMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernTie_Med.obj", "ModernTie_Dense.obj"]);
});
// Bounds read original OBJ positions, never the production extractor.
async function source(name: string) {
  const vertices: number[][] = [];
  for (const line of (await Bun.file(new URL(`../../assets/blitz-profile/${name}.obj`, import.meta.url)).text()).split("\n")) {
    const a = line.trim().split(/\s+/);
    if (a[0] === "v") vertices.push(a.slice(1).map(Number));
  }
  return { vertices };
}
test("representative spine-bearing rigid parts are not the existing light tie", async () => {
  const med = (await source("ModernTie_Med")).vertices;
  const dense = (await source("ModernTie_Dense")).vertices;
  const bounds = (v: number[][]) => [0, 1, 2].flatMap(a => [Math.min(...v.map(p => p[a])), Math.max(...v.map(p => p[a]))]);
  expect(bounds(med)).toEqual([-0.6, 0.6, -0.550534, 0.05, -0.199237, 0.199237]);
  expect(bounds(dense)).toEqual([-0.2, 0.2, -1.125, -0.625, -0.2, 0.2]);
  // Medium source includes vertices near spine1's round perimeter, unlike the
  // light tie (whose Y extent is only +/-0.05). No assembly/load rating implied.
  expect(med.some(([x, y]) => Math.abs(Math.hypot(x, y + 0.5133335) - 0.266667) < 0.002)).toBe(true);
});
