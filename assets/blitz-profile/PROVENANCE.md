# Modern untextured profile and rigid-part contribution

Source: IndividualKex/KexEdit revision
`0bf74c756b6282c589d924087e148909e4b17787`, under
`Assets/StreamingAssets/TrackStyles/`. `Modern.json`, `ModernRail.obj`,
`ModernSpine_1.obj`, `ModernSpine_2.obj`, `ModernTie_Med.obj` and
`ModernTie_Dense.obj` are archived unchanged. The focused tests pin their Git
blob hashes, checked against that revision's public GitHub tree.

`LICENSE.md` retains the MIT notice, copyright (c) 2025 IndividualKex.
`ATTRIBUTION.md` retains Felix's Modern track attribution and Bränningen's
Modern train attribution; no train is contributed here. Dylan confirmed MIT
permission for those contributions to KexEdit. Retain both notices on redistribution.

## Meaning and export boundary

These are untextured derived contributions, not lossless conversions of every
OBJ attribute. The raw sources contain UVs but no `mtllib` or `usemtl` binding.
Editable Blender files retain those UVs; glTF exports deliberately exclude them.
UV and texture portability are **not qualified**. The incoming profile gate still
rejects TEXCOORD and every other unsupported attribute; it does not discard them.

Source XYZ values are retained as meters without recentering, scaling or inferred
Unity placement. OBJ itself has no unit metadata. The semantic origin remains
(0,0,0), including the rail's asymmetric Z endpoints. Rebuild maps source
(x,y,z) to Blender (x,-z,y), a proper rotation reversed by standard glTF Y-up
export. All source triangles, winding and per-corner normals are retained;
source normals are normalized, not replaced with computed smooth normals.
No paint material is invented: absent OBJ materials export as absent glTF
primitive materials, retaining standard glTF defaults (white, metallic=1,
roughness=1, opaque). The source `Modern.json` color is style machinery, not an
OBJ material assignment, and is not baked into these assets.

| Source | X bounds (m) | Y bounds (m) | Z endpoints/bounds (m) | Meaning |
| --- | --- | --- | --- | --- |
| ModernRail | [-0.670029, 0.670029] | [-0.070030, 0.070026] | [-0.040003, 0.039997] | two 16-edge contours |
| ModernSpine_1 | [-0.266667, 0.266666] | [-0.780000, -0.246667] | [-0.05, 0.05] | one 24-edge contour |
| ModernSpine_2 | [-0.266667, 0.266666] | [-1.513334, -0.980000] | [-0.05, 0.05] | one 24-edge contour |
| ModernTie_Med | [-0.6, 0.6] | [-0.550534, 0.05] | [-0.199237, 0.199237] | rigid instance, 896 triangles |
| ModernTie_Dense | [-0.2, 0.2] | [-1.125, -0.625] | [-0.2, 0.2] | rigid instance, 76 triangles |

The existing light tie spans only Y +/-0.05: it is not substituted for the
spine-bearing medium part. Source default style1 lists rail + spine1 + medium
tie. Medium geometry extends down around spine1's upper region (12 source
vertices within 2 mm of its nominal round perimeter). Style2 additionally lists
spine2 and dense ties; the dense part spans the inter-spine region in Y. Both
rigid parts are contributed intact under the existing instance meaning. These
checks establish geometric compatibility with source selections, not engineering
strength, automatic assembly, spacing, collision clearance or attachment semantics.

Caps are separate source assets, including `ModernRail_StartCap.obj`,
`ModernRail_EndCap.obj`, the spine start/end caps and `Modern_StartTie.obj` /
`Modern_EndTie.obj`. None is included or flattened into a section. Both this
candidate and the current demo are uncapped. Thresholds, source duplication
Step/Offset/Spacing, automatic style selection, cap placement and a recipe engine
are unsupported here. This is not a complete Modern reconstruction. Live app/UI
integration remains separate; existing procedural demo geometry is unchanged.

## Rebuild and independent adoption

From the repository root, with Blender 5.2.2:

```sh
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/rebuild.py
```

Each `.blend` is an editable contribution retaining source UVs and custom corner
normals. Rebuild replaces it from archived OBJ, discarding edits, and writes the
corresponding `.gltf`/`.bin` under `demo/public/assets/`. Two consecutive rebuilds
produced byte-identical glTF and bin files (all ten SHA-256 comparisons passed).
The `.blend` container is not claimed byte-reproducible.

Standalone adoption uses Blender's native glTF importer and reads the imported
mesh section without Shallot, TypeScript, the rebuild parser or oracle helpers:

```sh
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/adopt.py -- /tmp/modern.blend /tmp/modern-blender.json
```

An optional third argument selects a directory containing the three profiles.
The resulting Blender file contains nine constructions: all three sections in
straight, 30-degree banked curve and recorded loop configurations. Objects share
a world frame and overlap intentionally; hide objects to inspect one construction.
This is a usable consumer example, not a general importer or another profile gate.

The local TS experiment `demo/src/profile-sweep.ts` uses the demo's existing
frames but is not connected to the app. Both consumers use 192 equal-length
intervals, open ends and frame-transported authored section normals. The recorded
loop uses linear position interpolation and shortest-path normalized quaternion
interpolation from shared plain `demo/src/loop-path.json`. Sampling, interpolation
and normal transport are consumer policies, not additions to the inner contract
or a shared sweep/recipe standard. Transported normals are not recomputed curved
surface normals and are not a claim of differential-geometric sweep accuracy.

## Focused and one-time external evidence

```sh
cd demo
bun test src/profile.test.ts src/modern-profile.test.ts
bun check
bun run typecheck
bun tools/qualify-modern.ts /tmp/modern-ts.json
cd ..
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/check-import.py
python assets/blitz-profile/check-construction.py /tmp/modern-ts.json /tmp/modern-blender.json
```

`check-import.py` independently parses archived source face corners and compares
all directed triangles and their associated positions/normals after native glTF
import, including both rigid parts. `check-construction.py` uses source low-end
face edges as its expected sections and independently computes analytic frames
and recorded quaternion rotation matrices. It checks every edge endpoint at all
193 stations, winding/topology, default-material identity and transported normals
for both consumers. Expected geometry is not read from production output or from
either consumer's extractor. The source parser/expectations are not imported by
adoption. Focused tests also pin source metric landmarks, archive identity,
contour adjacency, original directed triangles and default materials.

Measured one-time external boundary results on Blender 5.2.2:

- Native import: all 64/48/48 profile triangles and 896/76 rigid triangles match
  source topology/winding. Maximum position component error: 5.950e-8 m.
  Editable Blender files also retain every source face and its original UV corners.
- Native profile corner normal component error versus normalized OBJ: <=1.670e-5;
  dense tie <=3.049e-5. Medium tie <=4.855e-4 after Blender's second custom-normal
  encoding on import (the exported glTF versus source is <=2.000e-4). This is a
  measured shading discrepancy, not regenerated normals or omitted hard seams.
- TS constructions: maximum position error 5.950e-8 m, normal component error
  6.755e-8. Native Blender constructions: 2.058e-6 m and 9.349e-5 respectively,
  across all nine constructions and all stations. Reports read actual stored mesh
  positions and corner normals, not just pre-storage construction inputs. Native
  input normals were within 1.929e-5 before constructing/storing the new meshes;
  the additional custom-normal encoding exceeds the initially tried 6e-5 allowance.

Source comparisons allow 1e-6 m. Exported rigid corner normals allow 2.5e-4;
native import allows 5e-5 for profiles/dense tie and 6e-4 for medium tie. Blender
stores custom normals in a compressed angular representation, then renormalizes
on export/import; the medium tie's oblique hard seams show larger rounding than
the round sections. Construction comparisons allow 3e-6 m (single-precision
world coordinates) and 1e-4 normal components, including the constructed mesh's
additional custom-normal encoding (about 0.006 degrees per component). These are external comparison
allowances only: `profile.ts` and its 1e-6/1e-5 binding tolerances are unchanged.
No source positions are rounded in export; the source-import oracle's coordinate
keys round to the source's six-decimal grid only after checking the export noise.

Deliberate negative controls (each must exit nonzero):

```sh
for mode in unit origin topology normal; do
  blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/check-import.py -- "$mode"
  python assets/blitz-profile/check-construction.py /tmp/modern-ts.json /tmp/modern-ts.json "$mode"
  python assets/blitz-profile/check-construction.py /tmp/modern-blender.json /tmp/modern-blender.json "$mode"
done
```

The native controls alter imported coordinates by x100, shift X by 1 cm, reverse
triangle winding, or replace normals. Construction controls corrupt one reported
position, one index or one normal. Focused tests separately reject profile unit,
origin and missing-edge corruption; existing gate tests still reject incoming UVs.

Khronos `gltf-validator` 2.0.0-dev.3.10, run once using the already installed
`/tmp/tie-validator/node_modules/gltf-validator`, reported **zero errors, warnings,
infos and hints** for all five exports, resolving each external `.bin`. Exact
invocation (from repository root):

```sh
node - <<'JS'
const fs = require('fs'), path = require('path');
const validator = require('/tmp/tie-validator/node_modules/gltf-validator');
(async () => {
  console.log(validator.version());
  for (const name of ['ModernRail', 'ModernSpine_1', 'ModernSpine_2', 'ModernTie_Med', 'ModernTie_Dense']) {
    const folder = path.resolve('demo/public/assets');
    const result = await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(folder, name + '.gltf'))), {
      uri: name + '.gltf',
      externalResourceFunction: async uri => new Uint8Array(fs.readFileSync(path.join(folder, uri)))
    });
    console.log(name, result.issues);
    if (result.issues.numErrors || result.issues.numWarnings) process.exitCode = 1;
  }
})();
JS
```

The validator can be installed separately at that prefix with
`npm install --prefix /tmp/tie-validator gltf-validator@2.0.0-dev.3.10` when needed.
Blender and the external validator are one-time boundary checks, not routine
unit tests. No full pre-land, GPU or Playwright suite was run for this stage.
