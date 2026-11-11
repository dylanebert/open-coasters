# Static Blitz tie witness

Source: IndividualKex/KexEdit revision
`0bf74c756b6282c589d924087e148909e4b17787`,
`Assets/StreamingAssets/TrackStyles/ModernTie_Light.obj` (archived here unchanged).
The adjacent source `ATTRIBUTION.md` is preserved: Felix contributed Modern
track; Bränningen contributed Modern train. No train asset is included here.
Dylan confirmed permission for MIT licensing of both contributions to KexEdit.
`LICENSE.md` preserves the full applicable MIT notice, copyright (c) 2025
IndividualKex. Retain these notices when redistributing this contribution.

## Authored frame and rebuild

The raw OBJ has 64 positions. Its numeric bounds are X [-0.6, 0.6],
Y [-0.05, 0.05], Z [-0.049999, 0.050001]. We retain those coordinates as
meters: 1.2 m across X and 0.1 m across Y/Z. OBJ has no unit or handedness
metadata. This witness does not infer a Unity renderer frame, track placement,
or a semantic front from this nearly symmetric part. In particular, its origin
remains (0, 0, 0), not the bounds center at Z=0.000001.

From the repository root:

```sh
blender --background --python assets/blitz-tie/rebuild.py
```

`blitz-tie.blend` is the inspectable editable contribution. Rebuilding replaces
it from the archived OBJ, discarding Blender edits. The rebuild reads
OBJ positions and faces into a mesh, retaining topology and winding, and maps
source (x,y,z) to Blender (x,-z,y). This is a proper rotation, not a reflection.
The standard glTF Y-up export reverses that basis change. There is no recenter,
scale normalization, smoothing reconstruction, or imported KexEdit placement.
The contribution uses the current untextured static subset, without adding
track-style, profile, train, or attachment semantics.

## Independent adoption example, not just an oracle

```sh
blender --background --python assets/blitz-tie/place-twice.py -- /tmp/ties.blend
```

Open the resulting file in Blender to inspect two rigidly placed instances.
The standalone script imports glTF with Blender's importer, preserves the
imported hierarchy under placement empties, and reuses mesh data. It needs no
Shallot or project helper. An optional second argument selects another static
glTF contribution, e.g. `demo/public/assets/wheel-carrier.gltf`. It is a small
workflow example, not a general importer or format validator.

The separate `check-placement.py` oracle checks every archived source position
at (-1.5,0,0) and (1.5,0,0), with the second rotated +90 degrees about glTF Y.
It compares positions in both directions with 0.2 micrometer tolerance, including
the small authored offset. Run headlessly:

```sh
blender --background --python-exit-code 1 --python assets/blitz-tie/check-placement.py
# Each negative control must exit nonzero:
blender --background --python-exit-code 1 --python assets/blitz-tie/check-placement.py -- origin
blender --background --python-exit-code 1 --python assets/blitz-tie/check-placement.py -- unit
blender --background --python-exit-code 1 --python assets/blitz-tie/check-placement.py -- orientation
cd demo
bun test src/blitz-tie.gpu.test.ts src/instance.test.ts src/instance.gpu.test.ts
```

The focused Shallot tests check decoded source landmarks and both spawned rigid
placements, detection of deliberate frame/scale changes and the subset gate.
External Khronos validator and native Blender import spike results are recorded
in the contribution commit,
not added as routine live external-boundary tests. These witnesses qualify this
static tie only; they do not establish richer geometry or an asset-wide contract.
