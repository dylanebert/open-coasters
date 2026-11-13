# Assembly sources and qualification evidence

Original synthetic geometry authored in this change; MIT under the repository
`LICENSE`. No third-party geometry, textures or material libraries. `author.py`
is the readable native authoring/export recipe, and `assembly.blend` retains the
editable cyclic POLY curve and six editable mesh objects. Native Blender XZ
maps physically to glTF XY; glTF +Z maps to Blender -Y. One Blender unit is one
meter. No artificial matching-end extrusion is used to recover a section.

The independently inspectable delivery lives in `demo/public/assets/`:

- `assembly-section.gltf/.bin`: 16 samples of a .06 m radius circle, one closed
  16-edge cycle, no appearance. Source curve has zero bevel/extrude.
- `assembly-tie-bar.gltf/.bin`: static bar, bounds
  (-.95,-.18,-.09) to (.95,-.06,.09) m.
- `assembly-tie-fork.gltf/.bin`: three static bars, bounds
  (-.95,-.18,-.13) to (.95,-.10,.13) m.
- `assembly-fitting.gltf/.bin`: two asymmetric blocks, bounds
  (-.095,-.13,0) to (.21,.095,.20) m. Its offset geometry is intentional;
  origin (0,0,0) is the declared placement frame, not a recentered bounding box.

Tie native material: linear RGBA (.035,.32,.48,1), metallic .65, roughness .3.
Fitting: (.8,.24,.035,1), metallic .55, roughness .28. Opaque, untextured, flat
mesh normals; no supported appearance channel is replaced by the app. Rail and
cap appearance is operation-selected native material, not a section default.
`SECTION.md` owns the small geometry-only interpretation and explicit exclusions.

## Grounding

The existing native evidence archive
`strategy/open-coasters/units/profile-authoring-evidence.tar.gz`, restored under
`/tmp`, was inspected (`coasters-profile-authoring/REPORT.md`). It independently
measured native cyclic Curve evaluation to glTF LINES, and demonstrated loss of
editing controls and spline appearance. It explicitly did not give arbitrary
LINES section winding or sweep semantics. That supports retaining editable
source separately and qualifying sampled geometry only, not adopting the
proposed corner/appearance binding. The strategy referents `blender-profile-geometry`,
`blender-gltf-export`, `gltf` and `onshape-sweep` support the source/evaluation/
operation distinction; they are not runtime-format fidelity guarantees.

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
not section semantics. The first export attempt failed on unrecognized option
`export_loose_edges`; inspecting operator RNA established the actual option
`use_mesh_edges=True`, after which the native run succeeded. No test or budget
was relaxed.

`check-native.py` is independent of the TS decoder, policy and surface generator:

- opens the retained native source and checks 16 cyclic POLY points, radius,
  origin, identity scale, zero bevel/extrude and six editable meshes;
- imports section glTF with Blender's ordinary importer; compares each physical
  sample to independently calculated sine/cosine coordinates within 1e-7 m and
  checks the undirected closed 16-edge graph, with zero faces;
- constructs two straight rails directly from that imported graph at X ±.7 m,
  elevation 1.5 m and longitudinal endpoints ±6 m. Independent construction has
  36 polygons including four caps, bounds ±.76 m across, ±6 m along and
  1.44..1.56 m high. Saves `/tmp/assembly-independent.blend` for inspection;
- independently imports each static component and checks the bounds above and
  native material inputs (1e-7 m / 1e-6 channel tolerances).

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

## Focused stage checks

Run narrow to wide from `demo/`; all passed on the same Omarchy host:

```sh
bun test src/assembly.test.ts src/composition.test.ts src/configuration.test.ts
bun run typecheck
bun check
bun test src/assembly.gpu.test.ts src/composition.gpu.test.ts src/live.gpu.test.ts src/reset.gpu.test.ts
bunx playwright test tests/assembly.e2e.ts tests/composition.e2e.ts tests/history.e2e.ts tests/scene.e2e.ts
```

Results: 17 unit tests, 18,893 assertions; Svelte zero errors/warnings; Bun zero
type errors; 10 GPU tests, 3,303 assertions; 9 built `/open-coasters/` Chromium
browser tests. No whole pre-land command or all-suite run. Existing Vite startup
script/chunk-size warnings remain; no budgets or checks changed.

Independent expected results include section dimensions/frame/connectivity,
off-origin retention, source component bounds/materials, explicit straight and
banked rail/tie/fitting coordinates and quaternion orientation, emitted radius,
flat outward caps and invalid-input refusal. GPU tests exercise repeated
whole-registry replacement, destroyed old buffers, no new material registrations,
unit native scale, material reuse and retained camera entity/orbit. Browser tests
cover all new controls, keyboard history, repeated edits, example switching,
entry/path framing of rail/tie/fitting envelopes and desktop 1280×800 / phone
390×844 layout. Existing single/repeated controls and legacy source-witness
pixels/routes remain covered. Headless assembly screenshots were inspected at
`demo/test-results/assembly-1280.png` and `assembly-390.png` (ephemeral outputs).

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
