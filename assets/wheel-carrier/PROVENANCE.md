# Original wheel-and-carrier fixture

MIT, under the repository LICENSE. Created for this repository using Blender
primitives, not imported manufacturer, Blitz, private or community geometry.
Illustrative wheel-and-carrier only; no manufacturer accuracy or engineering claim.

Editable source: `wheel-carrier.blend` (Blender 5.2.2). From repository root:

```sh
blender --background --python assets/wheel-carrier/export.py
```

This regenerates the source and `demo/public/assets/wheel-carrier.{gltf,bin}`.
Alternatively open the source and export glTF Separate, +Y up, no animation,
cameras or lights. Do not normalize or recenter. Blender's (X,Y,Z) maps to glTF
(X,Z,-Y); scene units are metric, scale 1. The assembly object's translation
becomes (0.25, 0.30, -0.20) meters, not the geometry's bounding-box center.

The orange nose marks asset +Z. Object names are inspection aids, not binding
requirements. `check-import.py` holds the independent metric and placed-landmark
expectations; it imports neither exporter constants nor engine helpers.

Optional independent import spike (no exporter or engine helpers):

```sh
blender --background --python assets/wheel-carrier/check-import.py
```

The import is an export/decoder spike, not a Blender requirement for routine
pre-land checks. Its result and the Khronos validator result belong in the export's
commit evidence.
