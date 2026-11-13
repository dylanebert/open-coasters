# Assembly sources and qualification evidence

Original synthetic geometry authored in this change; MIT under the repository
`LICENSE`. No third-party geometry, textures or material libraries. `author.py`
is the readable native authoring/export recipe, and `assembly.blend` retains the
editable cyclic POLY curve and six editable mesh objects. Native Blender XZ
maps physically to glTF XY; glTF +Z maps to Blender -Y. One Blender unit is one
meter. No artificial matching-end extrusion is used to recover a section.

The independently inspectable delivery lives in `demo/public/assets/`:

- `assembly-section.gltf/.bin`: 16 samples of a .06 m radius circle, one closed
  16-edge cycle, no appearance; source curve has zero bevel/extrude
- `assembly-tie-bar.gltf/.bin`: static bar, bounds
  (-.95,-.18,-.09) to (.95,-.06,.09) m
- `assembly-tie-fork.gltf/.bin`: three static bars, bounds
  (-.95,-.18,-.13) to (.95,-.10,.13) m
- `assembly-fitting.gltf/.bin`: two asymmetric blocks, bounds
  (-.095,-.13,0) to (.21,.095,.20) m. Its offset geometry is intentional;
  origin (0,0,0) is the declared placement frame, not a recentered bounding box

Tie native material: linear RGBA (.035,.32,.48,1), metallic .65, roughness .3.
Fitting: (.8,.24,.035,1), metallic .55, roughness .28. Opaque, untextured, flat
mesh normals; no supported appearance channel is replaced by the app. Rail and
cap appearance is operation-selected native material, not a section default.
`SECTION.md` owns the small geometry-only interpretation and explicit exclusions.

## One-time boundary spikes (Omarchy, headless)

From repository root, on Linux 7.2.8-9-omarchy / Hyprland, no desktop windows:

```sh
blender --background --python assets/assembly/author.py
blender --background --python-exit-code 1 --python assets/assembly/check-native.py
GLTF_VALIDATOR=/home/dylan/.bun/install/cache/gltf-validator@2.0.0-75b88d36e44ba2e5@@@1 bun assets/assembly/check-format.cjs
```

Blender 5.2.2 LTS, hash d13f752e3b9c (2026-10-13), bundled Khronos glTF Blender
I/O v5.2.40; Bun 1.4.4 (38afee6c8). Validator npm package
`gltf-validator@2.0.0-dev.3.10`, reporting version 2.0.0-dev.3.10. The environment
path selects the already cached package, not a project dependency; an isolated
installation of that version may be substituted.

Results: native export completed; independent native source/import/construction
check printed `PASS: independent native line import, straight construction,
static dimensions/origin/materials 5.2.2 LTS`. All four deliveries reported zero
validator errors, warnings, infos and hints. Validator establishes format validity,
not section semantics. The exporter uses `use_mesh_edges=True` to retain the
evaluated curve's loose edges.

`check-native.py` is independent of the TS decoder, policy and surface generator:

- opens the retained native source and checks 16 cyclic POLY points, radius,
  origin, identity scale, zero bevel/extrude and six editable meshes
- imports section glTF with Blender's ordinary importer; compares each physical
  sample to independently calculated sine/cosine coordinates within 1e-7 m and
  checks the undirected closed 16-edge graph, with zero faces
- constructs two straight rails directly from that imported graph at X ±.7 m,
  elevation 1.5 m and longitudinal endpoints ±6 m. Independent construction has
  36 polygons including four caps, bounds ±.76 m across, ±6 m along and
  1.44..1.56 m high. Saves `/tmp/assembly-independent.blend` for inspection
- independently imports each static component and checks the bounds above and
  native material inputs (1e-7 m / 1e-6 channel tolerances)

The native oracle was also challenged with a changed section landmark:

```sh
mkdir -p /tmp/assembly-negative
cp demo/public/assets/assembly-* /tmp/assembly-negative/
python - <<'PY'
from pathlib import Path
import struct
p = Path('/tmp/assembly-negative/assembly-section.bin')
b = bytearray(p.read_bytes())
struct.pack_into('<f', b, 0, .066)
p.write_bytes(b)
PY
ASSEMBLY_DELIVERY=/tmp/assembly-negative blender --background --python-exit-code 1 --python assets/assembly/check-native.py
```

Expected result observed: exit 1, physical-coordinate assertion failure at the
independent radius comparison. Positive native check reran successfully afterward.
The directed serialization expectation is checked separately against explicit
0→1→…→15→0 indices in the routine TS test; the importer graph does not establish
that convention on its own.

These are one-time boundary spikes. Routine tests require only committed local
inputs, Bun, the pinned app dependencies and the existing GPU/browser environment;
no Blender, validator, strategy archive or sibling repository is required.

## Qualification limits and remaining judgment

This qualifies this evaluated sampled convex section, two simple static ties and
one authored fitting, not lossless Curve editing data, all Blender export settings,
all section types, native line shading, arbitrary glTF, engineering attachment,
train clearance or a shared sweep/placement policy. The independently constructed
native scene is straight; analytic unit/GPU/browser expectations cover the app's
banked path, rather than claiming identical native bevel behavior. The app's
faceted rails and untextured flat closures are explicit operation choices.

The existing app exposes `Asset assembly` in Example, or directly at
`/open-coasters/?example=assembly`. The person still judges the interactive
result. These technical checks neither accept a full contract nor close the
asset loop or its roadmap item.
