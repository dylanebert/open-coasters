# Offline loop authoring

`export-loop.ts` owns the pinned KexEdit revision and authored recipe. From the repository root:

```sh
bun demo/tools/export-loop.ts /path/to/KexEdit
```

The checkout must match the pin with no tracked source, package or lockfile changes. Generation is a source-boundary spike, not a routine app check; normal app, build and tests need no sibling checkout.

Keep force/free-roll authoring separate from geometric fitting. The records describe a lossless point mass with zero COM offset, not a train-clearance or safety model. `demo/src/loop-path.json` holds distance, position and XYZW quaternion in KexEdit coordinates; `demo/fixtures/loop-state.json` holds provenance and matching state/intent samples.

The final record is a physical partial step at the terminal forward-Y root, not a snapped position or rotation. Recompute free energy for that duration. Retain actual sample timestamps for the unequal terminal derivative stencil.

Source -Z is forward; demo +Z follows increasing distance. Reverse both local X and Z to preserve handedness, never one axis. World placement is rigid; camera framing is separate. Nonplanar sweep quads need per-triangle geometric normals.

When changing records, interpolation, profiles or supported controls, update the independent force and emitted-envelope checks in `demo/src/loop.test.ts`. Tube containment alone does not establish local mesh separation. The Parametric certificate does not qualify Blitz construction.

For headless side, front and endpoint captures, run from `demo/` against a built preview: `bun tools/loop.oracle.ts http://127.0.0.1:4173/open-coasters/`.
