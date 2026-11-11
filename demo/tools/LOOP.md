# Recorded loop authoring

This is a lossless point-mass example with zero COM offset, not a train-clearance
model or safety certification. It uses KexEdit as an offline producer; the demo
runs no physics solver. No KexEdit code was copied, and Blitz source notices are
unchanged.

## Reproduce

`export-loop.ts` owns the pinned KexEdit revision and authored recipe.
It requires an explicit checkout at that revision and refuses tracked changes to
its source, package or lockfile. From this repository root:

```sh
bun demo/tools/export-loop.ts /path/to/KexEdit
```

Generation crosses the source boundary as a spike, not a routine app check.
Normal app, build and tests need no sibling checkout.
The recipe authors a new loop rather than extracting `ride.fixture.ts`, whose
loop holds constant normal g.

The force intent falls from high normal g on entry to near-zero at the crown
and rises again on exit. A smooth roll-rate pulse around the crown separates the
lower branches. These are inputs to KexEdit's force/free-roll policies, not a
geometric fit or post-export deformation. The default force floor is unchanged.

## Records and placement

- `src/loop-path.json`: `[distance, px, py, pz, qx, qy, qz, qw]` in KexEdit coordinates
- `fixtures/loop-state.json`: source provenance, constants, initial state, recording cadence and matching state/intent samples

Only the path is imported by the app. `track.ts` interpolates position and the
shortest-hemisphere unit quaternion by recorded distance.
Source -Z is forward, while demo +Z follows increasing distance: reverse both
local X and Z to preserve handedness and rider-up, never reflect one axis.
World placement is rigid, with no scale.

The path has separate entry/exit ends. A side projection can cross even when the
spatial branches are separated; inspect a front view too.
Nonplanar sweep quads need per-triangle geometric normals.

## Independent checks

`src/loop.test.ts` reconstructs force from recorded world-velocity differences
and separately from position curvature, without importing producer helpers.
It identifies the crown geometrically and checks force, energy, arc-length
placement, proper frames and component dimensions.

Its track-envelope certificate encloses rail profiles, spine corners and both
adjustable and fixed ties over the supported controls, not only the centerline.
A C1 Hermite reference through the generated records is used only for that
certificate, never to author or render the path.
Bezier derivative bounds cover curvature, interpolation error and whole intervals.
Local normal-disk regularity, global interval-ball separation and endpoint
extensions cover the track envelope without an arbitrary adjacent-arc exclusion.
Intentional rail/tie/spine joints within one branch are not claimed disjoint.

The certificate's implementation and bounds live in that test; update them when
changing records, interpolation, profiles or supported controls.
The authoring commit records source-boundary measurements, failing force/clearance
controls and inspected views. Runtime replacement and browser checks are listed
in `../WALKTHROUGH.md`.
