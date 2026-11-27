# Placed USD tie: source and qualification evidence

Original synthetic geometry and material, MIT under the repository [license](../../LICENSE).
[author.py](author.py) creates the editable Blender objects and exports
[tie.usda](tie.usda) directly. The checked-in file is the native export, unedited.
It is Z-up with `metersPerUnit = 0.01`: the exporter represents the unit conversion
in the root transform, without rewriting the mesh-local point coordinates.

## Independent expectations

The tapered tie has eight vertices and six outward-wound quads. Its mesh-local
base is 0.03 m above its origin and its long edge is 1.20 m. The authored root
origin is `(0.30, -0.20, 0.05)` m in Blender's Z-up frame. The root's +90° Z
rotation sends the child offset `(0.06, 0.09, 0.04)` m to `(-0.09, 0.06, 0.04)` m.
The child rotates back by −90° Z, so its first point lands at
`(0.23, -0.22, 0.12)` m in the source world frame. For the OpenUSD placement,
rotate Z-up to Y-up as `(x, z, -y)`, then rotate +90° about Y and translate by
`(2, 1, -3)` m. The first point must land at `(2.22, 1.12, -3.23)` m and the
root origin at `(2.20, 1.05, -3.30)` m.

[check-openusd.py](check-openusd.py) evaluates the native transforms at default
time and checks both frames and all eight placed points against hand-calculated
values. It reads polygon connectivity and winding and resolves the material
with `ComputeBoundMaterial`, checking `TieSteel`, its connected
`UsdPreviewSurface`, and the authored RGB `(.125, .25, .5)`, metallic `.75`,
roughness `.375` and opacity `1`. OpenUSD's `ComputeColorSpaceName` on the
shader's `inputs:diffuseColor` attribute resolves `lin_rec709_scene`.
Seven private-layer mutations fail on separate assertions: wrong `defaultPrim`,
metres instead of centimetres, Y up instead of Z up, removed child offset,
reversed quad winding, a stronger ancestor binding to another material with the
same shader, and a change only to `/_materials/TieSteel.colorSpace:name` to
`srgb_rec709_scene`. The binding mutation leaves the direct mesh relationship
alone; the color-space mutation leaves the numeric RGB, binding and shader unchanged.

## Recorded checks

Linux 7.2.15-1-omarchy, Python 3.14.8 with OpenUSD 26.08 (`usd 26.08-1`),
Blender 5.2.2 LTS (`d13f752e3b9c`, linked with the same system OpenUSD).
Run from the repository root. The preload is a host-specific workaround for the
system OpenUSD Python binding's static TLS failure, not a project dependency.

```bash
TIMEFORMAT='wall %3R s'
time LD_PRELOAD=/usr/lib/libjemalloc.so.2 python assets/usd-tie/check-openusd.py -v

(
  scratch=$(mktemp -d) || exit
  trap 'rm -r "$scratch"' EXIT
  time (blender --background --factory-startup --python-exit-code 1 \
    --python assets/usd-tie/author.py --python assets/usd-tie/check-blender.py \
    -- "$scratch/tie.usda" && cmp assets/usd-tie/tie.usda "$scratch/tie.usda")
)
```

OpenUSD: 8 tests passed, 0.197 s wall. The isolated color-space control failed
with `AssertionError not raised` before the effective input assertion was added,
then passed (0.191 s wall each). The original native Blender export/import and
byte comparison took 0.593 s wall (Blender reported export 22.98 ms and import
1.16 ms). The Blender source, fixture bytes and import assertions are unchanged;
that run was not repeated.
[check-blender.py](check-blender.py) clears the authoring scene before importing.
It checks the parent–child relation, both metric frames, vertex positions, quad
winding and the face assignment to the imported material with matching connected
Principled BSDF inputs. `cmp` confirmed that Blender imported the same bytes the
OpenUSD check read. The conformance check uses only local OpenUSD and the checked-in
fixture. Blender is a one-time boundary check, not a Bun or site dependency.

## Measured limits

A Blender import masked to `/Tie` kept the geometry but lost the bound
material at `/_materials/TieSteel`. Importing the complete standalone file kept
the binding and added an empty `_materials` object outside the `Tie` hierarchy.
OpenUSD selects `/Tie` without masking the stage and resolves the sibling material.
An authoring probe with Blender `scale_length = .01` and a 120-unit mesh edge
exported a 120 m edge, not the intended 1.20 m: the exporter treated Blender
coordinates as metres. The retained source authors in metres and requests
centimetre USD delivery explicitly.

This local reader asserts one standalone fixture at default time. It does not
validate arbitrary USD, test external composition, or qualify general Blender
options, normal or texture transfer, subset materials, or lossless shader
conversion. No rendering or rendered appearance comparison was performed.
