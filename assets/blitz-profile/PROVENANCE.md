# Modern untextured profiles and rigid parts

Source: IndividualKex/KexEdit revision
`0bf74c756b6282c589d924087e148909e4b17787`, under
`Assets/StreamingAssets/TrackStyles/`. `Modern.json`, `ModernRail.obj`,
`ModernSpine_1.obj`, `ModernSpine_2.obj`, `ModernTie_Med.obj` and
`ModernTie_Dense.obj` are archived unchanged. Focused tests pin their source Git
blob hashes.

`LICENSE.md` retains the MIT notice, copyright (c) 2025 IndividualKex.
`ATTRIBUTION.md` retains Felix's Modern track attribution and Bränningen's
Modern train attribution; no train is contributed here. Dylan confirmed MIT
permission for those contributions to KexEdit. Retain both notices on redistribution.

## Meaning and export boundary

These are untextured derived contributions, not lossless conversions of every
OBJ attribute. The sources contain UVs but no `mtllib` or `usemtl` binding.
Editable Blender files retain those UVs; glTF exports deliberately exclude them.
UV and texture portability are not qualified. The profile gate still rejects
TEXCOORD and every other unsupported attribute; it does not discard them.

Source XYZ values are retained as meters without recentering, scaling or inferred
Unity placement. OBJ itself has no unit metadata. The origin remains (0,0,0),
including the rail's asymmetric Z endpoints. Rebuild maps source (x,y,z) to
Blender (x,-z,y), a proper rotation reversed by standard glTF Y-up export.
Directed triangles and per-corner shading are preserved within the comparison
allowances below. Source normals are normalized, not regenerated; Blender's
custom-normal storage introduces rounding.

Absent OBJ materials export as absent glTF primitive materials, retaining
standard glTF defaults: white, metallic=1, roughness=1, opaque. The color in
`Modern.json` belongs to the source style, not an OBJ material assignment.

| Source | X bounds (m) | Y bounds (m) | Z endpoints/bounds (m) | Meaning |
| --- | --- | --- | --- | --- |
| ModernRail | [-0.670029, 0.670029] | [-0.070030, 0.070026] | [-0.040003, 0.039997] | two 16-edge contours |
| ModernSpine_1 | [-0.266667, 0.266666] | [-0.780000, -0.246667] | [-0.05, 0.05] | one 24-edge contour |
| ModernSpine_2 | [-0.266667, 0.266666] | [-1.513334, -0.980000] | [-0.05, 0.05] | one 24-edge contour |
| ModernTie_Med | [-0.6, 0.6] | [-0.550534, 0.05] | [-0.199237, 0.199237] | rigid instance, 896 triangles |
| ModernTie_Dense | [-0.2, 0.2] | [-1.125, -0.625] | [-0.2, 0.2] | rigid instance, 76 triangles |

Source default style1 lists rail, spine1 and medium tie. The existing light tie
spans only Y +/-0.05 and is not substituted for the spine-bearing medium part.
Style2 additionally lists spine2 and dense ties. Both rigid parts retain instance
meaning. Source selections establish neither engineering strength, spacing,
collision clearance nor attachment semantics.

Caps are separate source assets: rail/spine start and end caps, `Modern_StartTie.obj`
and `Modern_EndTie.obj`. None is included or flattened into a section.
Thresholds, duplication Step/Offset/Spacing, automatic style selection and cap
placement are unqualified. This is not a complete Modern reconstruction.

## Rebuild and independent adoption

From the repository root, with Blender 5.2.2:

```sh
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/rebuild.py
```

Rebuild replaces each editable `.blend` from archived OBJ, discarding edits,
and writes its `.gltf`/`.bin` under `demo/public/assets/`. The Blender files retain
source UVs and custom corner normals; their containers are not byte-reproducible.

Standalone adoption uses Blender's native glTF importer and extracts the section
without Shallot, TypeScript, the rebuild parser or verification helpers:

```sh
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/adopt.py -- /tmp/modern.blend /tmp/modern-blender.json
```

An optional third argument selects a directory containing the three profiles.
The Blender file contains all three sections in straight, 30-degree banked curve
and recorded loop configurations. Objects overlap in one world frame; hide them
to inspect one construction. This example is not a general importer or profile gate.

Both this consumer and `demo/src/profile-sweep.ts` use 192 equal-length intervals
and frame-transported authored wall normals. The construction comparison covers
side walls, not the demo's generated endcaps. The loop uses linear position
and shortest-path normalized quaternion interpolation over `demo/src/loop-path.json`.
These are consumer policies, not an inner contract or shared sweep standard.
Transported normals are not recomputed curved-surface normals.

## Qualification

```sh
cd demo
bun test src/profile.test.ts src/modern-profile.test.ts
bun tools/qualify-modern.ts /tmp/modern-ts.json
cd ..
blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/check-import.py
python assets/blitz-profile/check-construction.py /tmp/modern-ts.json /tmp/modern-blender.json
```

`check-import.py` compares every directed source triangle and associated corner
normal with native glTF import, and checks editable-source UV retention.
`check-construction.py` derives expected edges from archived source face records
and independently computes the analytic and recorded frames. It compares all
edge endpoints at all 193 stations, topology, default materials and transported
normals with both consumers' stored output. Neither oracle imports adoption or
extraction helpers.

| Comparison | Position allowance | Normal-component allowance |
| --- | --- | --- |
| Source vs export | 1e-6 m | 2.5e-4 |
| Source vs native import | 1e-6 m | 5e-5; medium tie 6e-4 |
| Source vs stored construction | 3e-6 m | 1e-4 |

These allowances cover float32 coordinates and custom-normal rounding, not
replacement geometry or regenerated shading. They do not widen the profile
binding's 1e-6/1e-5 tolerances. The source-import oracle checks coordinate error
before matching keys rounded to the source's six-decimal grid.

Negative controls must exit nonzero:

```sh
for mode in unit origin topology normal; do
  blender -b -t 2 --python-exit-code 1 --python assets/blitz-profile/check-import.py -- "$mode"
  python assets/blitz-profile/check-construction.py /tmp/modern-ts.json /tmp/modern-ts.json "$mode"
  python assets/blitz-profile/check-construction.py /tmp/modern-blender.json /tmp/modern-blender.json "$mode"
done
```

Blender import/construction, Khronos validation and export reproducibility are
one-time boundary checks. Their commands, versions, measured discrepancies and
results are recorded in contribution commit `5c752e1`; they are not routine
network-dependent tests. Qualification is bounded to these untextured assets and
the stated consumer policies.
