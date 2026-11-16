# Offline loop authoring

`export-loop.ts` owns the pinned KexEdit revision and authored recipe. From the repository root:

```sh
bun demo/tools/export-loop.ts /path/to/KexEdit
```

The checkout must match the pin with no tracked source, package or lockfile changes. Generation is a source-boundary spike, not a routine app check; normal app, build and tests need no sibling checkout.

Tune authored motion inputs against both realized rider experience and shape; do not fit geometry afterward by moving emitted poses or scaling the mesh. The records describe a lossless point mass with zero COM offset, not a train-clearance or safety model. `demo/src/loop-path.json` holds distance, position and XYZW quaternion in KexEdit coordinates; `demo/fixtures/loop-state.json` holds provenance and matching state/intent samples.

The selected loop is a deliberately approximate construction example, not a Medusa timing reproduction.

The final record is a physical partial step at the terminal forward-Y root, not a snapped position or rotation. Recompute free energy for that duration. Retain actual sample timestamps for the unequal terminal derivative stencil.

Source -Z is forward; demo +Z follows increasing distance. Reverse both local X and Z to preserve handedness, never one axis. World placement is rigid; camera framing is separate. Nonplanar sweep quads need per-triangle geometric normals.

Requalify record, interpolation, profile or supported-control changes with the independent force checks in `demo/src/loop.test.ts` and emitted-envelope/local-piece checks in `demo/src/loop.node.ts`. Tube containment alone does not establish local mesh separation. The `track.generate` witness certificate does not qualify live NormalTrack, Blitz or Modern geometry.

## Shaping verification

- Physical consistency and rendered fidelity do not establish a plausible coaster shape; qualify that separate claim against an identified real element
- Pair force evidence with actual reference images and dimensions, identifying the element, recording segment, seat, camera/scale uncertainty and missing measurements. Ride-wide speed, extrema and lift height are not element measurements
- Before tuning, state intended experience and shape features together: force transitions, crown/body proportions, lateral footprint, banking and entry/exit relationships. Derive bounds from the reference, not the candidate being checked
- Define each force-timing window by named force/motion boundaries, distinguishing complete unloading/reloading from a threshold-defined core
- Compare metric-scale side, front and top views of the actual centerline alongside perspective captures and independently reconstructed force/time curves. Visibility and camera framing alone are not shape inspection
- Make bounded heuristic input changes, measure their downstream effects, and compensate explicitly while checking both experience and geometry. The fitting mathematics remains open; add no universal optimizer for this example
- Recheck inherited constraints against the current reference. A former diagnostic's bank lobes or nonplanarity are not requirements for every loop; do not refresh golden coordinates or shape metrics as a substitute for a reference check
- Keep independent physics, interpolation and emitted-geometry checks. Stop before wider renderer qualification when the shape contradicts the reference or the person's accepted example; record the mismatch rather than calling it taste left over after a technical pass

`loop.oracle.ts` predates the current chooser and field names; update it before reuse. It is an inspection aid, not a shape verdict.
