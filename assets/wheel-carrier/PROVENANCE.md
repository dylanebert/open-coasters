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

Independent inspection targets (glTF meters): total bounds (-0.70, 0.30, -0.60)
to (1.20, 0.90, 0.70); wheel diameter 0.60, axle direction X, wheel thickness
0.20; carrier size (1.40, 0.30, 0.80). Orange nose center (0.25, 0.60, 0.45)
points toward asset +Z. Object names are inspection aids, not binding requirements.

For demo placement A, bounds are (-2.20, 0.30, -0.60) to (-0.30, 0.90, 0.70),
nose (-1.25, 0.60, 0.45). For B (+90° Y), bounds (0.90, 0.30, -1.20) to
(2.20, 0.90, 0.70), nose (1.95, 0.60, -0.25). These targets are specified
separately from the loader, placement helpers and exporter script.

Optional independent import spike (no exporter or engine helpers):

```sh
blender --background --python assets/wheel-carrier/check-import.py
```

The headless import and Khronos validator results are recorded in the implementation
commit evidence. They are export/decoder spikes, not Blender requirements for
routine pre-land checks.
