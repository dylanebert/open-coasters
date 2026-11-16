# Modern start/end ties — static parts

These are static instances under `instance-contract.md`. Their names establish
no attachment, welding, track-forward or end-placement meaning.

## Source and permission

Archived unchanged from [IndividualKex/KexEdit](https://github.com/IndividualKex/KexEdit),
revision `0bf74c756b6282c589d924087e148909e4b17787`,
`Assets/StreamingAssets/TrackStyles/`:

| File | Git blob SHA-1 |
| --- | --- |
| Modern_StartTie.obj | 73caffe94be726cf3dc979f2cecc66d4cd616613 |
| Modern_EndTie.obj | 01ab3a4cbb0ee4e29b0aeaae5f87848e0a1ba359 |

Extract from a checkout holding the pinned revision:

```sh
for name in Modern_StartTie Modern_EndTie; do
  git -C /path/to/KexEdit show 0bf74c756b6282c589d924087e148909e4b17787:Assets/StreamingAssets/TrackStyles/$name.obj > assets/modern-end-ties/$name.obj
done
```

MIT permission is the established Modern-track permission recorded in
`assets/blitz-profile/PROVENANCE.md`, including Dylan's confirmation of Felix's
contribution. `LICENSE.md` and `ATTRIBUTION.md` preserve the same upstream notices:
copyright (c) 2025 IndividualKex, Felix's Modern track attribution, and Bränningen's
Modern train attribution (no train is delivered). Both notices are also embedded
in editable Blender text blocks and glTF copyright.

## Meaning, frame and retained appearance

Source numeric XYZ is retained as meters, with origin (0,0,0), no recentering or
inferred Unity transform. OBJ has no unit metadata; this is the contribution's
explicit metric interpretation, not evidence of upstream physical calibration.
The right-handed +Y-up/+Z-front local frame follows `instance-contract.md`;
source (x,y,z) becomes Blender (x,-z,y), reversed by glTF Y-up export.

| Source landmark bounds (m) | X | Y | Z |
| --- | --- | --- | --- |
| Modern_StartTie | [-0.6, 0.6] | [-0.070002, 0.069998] | [-0.080002, -0.000002] |
| Modern_EndTie | [-0.6, 0.6] | [-0.070002, 0.069998] | [0.000002, 0.080002] |

Each has 260 directed triangles. Geometry and normalized source corner normals
are retained; normals are not regenerated. Blender custom-normal storage rounds
them. Source UVs remain in editable `.blend` files but are deliberately omitted
from these untextured glTF deliveries. Neither OBJ binds materials (`mtllib` or
`usemtl`); glTF primitives likewise omit materials, retaining glTF's default white,
metallic=1, roughness=1, opaque appearance, not source-style paint. No texture/UV
portability, cap behavior, construction or placement semantics are claimed.

## Reproduce and check

Run from repository root. Rebuild replaces editable files (discarding edits) and
writes separate `.gltf`/`.bin` files under `demo/public/assets/`. Editable containers
are not byte reproducible. Blender 5.2.2 LTS was used, build hash `d13f752e3b9c`.

```sh
blender -b -t 2 --python-exit-code 1 --python assets/modern-end-ties/rebuild.py
python assets/modern-end-ties/check-source.py
for name in Modern_StartTie Modern_EndTie; do
  bun demo/tools/check-asset.ts instance "$PWD/demo/public/assets/$name.gltf"
done
for name in ModernRail ModernSpine_1 ModernSpine_2; do
  bun demo/tools/check-asset.ts profile "$PWD/demo/public/assets/$name.gltf"
done
blender -b -t 2 --python-exit-code 1 --python assets/modern-end-ties/check-import.py
```

The stdlib CPU oracle needs only checked-in inputs. It pins the original Git
blobs, reads OBJ records and raw glTF accessors independently of exporter,
Shallot and example helpers, matches directed triangles (cyclic rotations only,
with multiplicity), and compares every corner position and normalized normal.
It checks an identity authored frame and absent material/UV output. Its negative controls check the source oracle, not unsupported-content
refusal by the subset gate.

Native adoption uses Blender's actual glTF importer, not its exporter parser or
Shallot. The separate script compares imported directed triangles and shading
against archived source, inspects editable UV/geometry/normal retention and
checks absent native materials. No exporter or example helper is imported.
It exercises static adoption, not placement or attachment behavior.

```sh
# Each invocation must exit nonzero (1 with --python-exit-code 1):
for mode in unit origin topology normal material; do
  blender -b -t 2 --python-exit-code 1 --python assets/modern-end-ties/check-import.py -- "$mode"
done
```

## Qualification limits

| Comparison | Position allowance | Normal-component allowance |
| --- | --- | --- |
| Source vs export | 1e-6 m | 2.5e-4 |
| Source vs native import | 1e-6 m | 1e-4 |

Native negative controls damage the first imported part; CPU controls cover both
parts. Source comparison uses six-decimal position keys and directed triangles;
these checks qualify these source files, not a general geometry comparator.

Khronos format check (external tool, not a routine dependency):

```sh
# Point GLTF_VALIDATOR at an installed gltf-validator 2.0.0-dev.3.10 package.
GLTF_VALIDATOR=/path/to/gltf-validator node assets/modern-end-ties/check-format.cjs
```

Measured discrepancies and boundary receipts are recorded in the contribution
commit. Native import, Khronos validation and repeated export are one-time
boundary checks; the CPU source oracle needs only checked-in inputs.
Qualification covers these static, untextured parts and native import, not broader
asset capabilities or initial-release readiness.
