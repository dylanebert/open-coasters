# Recorded loop: offline authoring evidence

This is one fixed, lossless mass-point example, not a track construction API,
train-clearance model or safety/dynamics certification. No KexEdit code was copied.
The existing Blitz tie source and notices are unchanged.

## Source and authored inputs

Producer: [dylanebert/KexEdit](https://github.com/dylanebert/KexEdit), revision
`2d8745a44be2c53465509afd810f20e96a5aba14`, specifically
`src/trajectory/policies.ts` (`run`, default `policy`) and its integrator. This
example is newly authored; it does **not** extract `ride.fixture.ts`, whose loop
holds 3.5 g throughout.

`export-loop.ts` takes an explicit checkout path. The recorded source-boundary
spike was run from this repository root with:

```sh
bun demo/tools/export-loop.ts /home/dylan/kex/kexedit
```

The tool checks the revision and refuses tracked source/package/lock changes.
It neither edits the checkout nor copies its solver. Generation is an offline
spike; normal app/build/tests need no sibling repository or regeneration.

Authored constants:

- 1,000 ticks/s; initial position (0,0,0), identity rotation, -Z forward,
  distance 0, speed **15.6 m/s**.
- Gravity **9.81 m/s²**, heart-to-COM **0 m**, mass **500 kg**, friction **0**,
  drag **0**. Mass is immaterial with drag absent. No train, wheelbase, COM-offset
  or dissipation claim is implied.
- For each tick, theta is `atan2(forward.y, -forward.z)` mapped into [0,2π).
  Authored COM normal g is `2 + 2 cos(theta)`, lateral g is **0**; energy intent
  is **free**.
- The roll lane is zero outside theta ∈ (π/2,3π/2). Inside, it is
  `0.32 sin²(theta - π/2) × 9.81 (2 + up.y) / speed` rad/s. The final factor is
  an authored reference pitch rate, not a geometric postprocessing operation.
  Roll rate and its first derivative go to zero at the pulse boundaries.
- The default force floor remains **5 m/s**, unchanged. The minimum generated
  speed is **5.198955 m/s**; no lower floor or disabled refusal is involved.

A four-second causal probe authors per-tick intents from emitted states; a
second `run()` replays the fixed intent table through the unchanged policies.
The example ends at the first upward crossing of horizontal forward after the
inversion: tick **3341**. It does not force endpoint coincidence. The roll-lane
integral is about **30°** around the moving forward axis; peak roll rate is
**0.62205 rad/s**. This is not a 30° bank about a fixed world axis.

## Recorded output and consumer

`src/loop-path.json` contains 670 f64-history samples rounded to 10 decimal places,
recorded every fifth tick plus the final tick. Each row is
`[distance, px, py, pz, qx, qy, qz, qw]` in KexEdit coordinates.
SHA-256:
`aea70890f9e49717433b675df495b11c0437aeb354599632bd3bfeafcd05caff`.
Repeated export produced the same path bytes. `fixtures/loop-state.json` records
revision, constants, source-boundary measurements and matching
`[time, speed, authoredNormal, authoredLateral, authoredRoll]` rows. Only the path
is imported by the app.

The generated centerline is **34.652040 m** long and rises **11.026038 m**.
The highest recorded point is at time **1.665 s**, distance **17.317243 m**,
speed **5.198955 m/s**, authored normal **0.0000008601 g**. Exit speed is
**15.475252 m/s** and authored normal **3.999997 g**. Entry is **4 g**.
Independent chord curvature is about **0.121109 m⁻¹** near entry and
**0.362941 m⁻¹** at the crown: it is not a circle. The lower branches are
spatially separated, even though they cross in a side projection.

`track.ts` finds the bracketing recorded distances, linearly interpolates position
and shortest-hemisphere normalized-interpolates quaternion. A rigid world Y
half-turn plus translation (2.2,1.5,-4.3) places the example; there is **no scale**.
Demo +Z follows increasing distance, whereas source -Z is forward: local X and Z
are both reversed, preserving determinant +1 and rider-up. Rail/spine sweeps,
metric tie stations and rigid asset placements share these proper frames.
Nonplanar loop quads emit separate triangle normals in Shallot's existing packed
vertex layout; straight/curve dimensions and tessellation are unchanged.

The shared initial camera distance remains **19 m**. Only initial target Y changes
from 3 to **5 m** to include the taller inversion. No update changes camera state,
and the standard lighting is unchanged.

## Independent checks and observed results

`src/loop.test.ts` imports only recorded data, not the exporter or KexEdit helpers.
An explicit quaternion matrix and world-velocity differences reconstruct normal
and lateral force. A separate tangent/curvature reconstruction from recorded **positions**, arc
length and speed reconstructs the geometric force components. Maximum recorded-data errors:

| Check | Maximum |
| --- | ---: |
| Velocity-derived normal | 0.000260 g |
| Velocity-derived lateral | 0.000343 g |
| Geometry/speed-derived normal | 0.000248 g |
| Geometry/speed-derived lateral | 0.000350 g |
| Specific energy `v²/2 + gy` | 1.204e-9 J/kg |

The source-boundary audit separately differentiates full-rate f64 world velocity
with an explicit matrix, not producer force/rotation helpers: normal error
**0.000198 g**, lateral **0.000347 g**, energy drift **1.478e-12 J/kg**.
The recorded tests identify the crown by maximum geometric height and lower
entry/exit by geometric minima, then establish high / near-zero / high normal g.
Station positions and axes are checked against independent recorded-position and
spherical-quaternion oracles, including between-record proper-frame and tangent
agreement. Straight/curve literal dimension fixtures are retained; loop component
dimensions and parameter isolation are tested separately.

### Track-envelope certificate

This is not merely centerline or endpoint separation. The tests enclose all rail
profiles, spine corners and adjustable/fixed tie boxes over the full supported
control ranges: spacing 0.3–1.5 m, separation 0.6–1.6 m, width 0.15–0.6 m and depth
0.15–0.8 m. Emitted mesh corners are also audited at dimension/spacing endpoints.
Fixed tie bounds are the independently documented source bounds, not resized
adjustable ties.

A C1 Hermite reference through the **already generated** records is used only for
the certificate, never to author/render the shape. Bezier convex-hull derivative
bounds establish curvature, interpolation error and whole-interval bounding balls.
The envelope includes finite sweep chords and Float32/JSON roundoff. Its radius
is at most **1.064814 m**, inside a **1.08 m** regular tube.

There is no unchecked arbitrary adjacent-arc exclusion. For local intervals the
curvature/tangent inequality proves disjoint normal disks, with dimensionless
margin **0.172613**. All other interval pairs have disjoint enclosing balls:
**202,233 pairs**, minimum conservative tube gap **0.277634 m**. Short reference
extensions and a **0.127312 m** endpoint support margin also cover tie overhangs.
These are conservative certificate margins, not a measured minimum surface gap.
Intentional rail/tie/spine joints within one branch are not claimed disjoint.
The claim is limited to track geometry, not a train envelope.

### Negative controls (both reverted)

- Add **0.1 g** to the recorded authored-normal rows, leaving geometry/state
  unchanged: the force check fails at **0.100260 g** (limit 0.003 g);
  geometric reconstruction also departs **0.100248 g**.
- Regenerate through the same KexEdit policies with **roll amplitude 0**: the
  swept-envelope clearance check fails with margin **−2.227820 m**, while the
  envelope containment, local and endpoint checks still pass. Restoring the
  0.32 pulse restores positive clearance. No planar/circular replacement is kept.

The narrow CPU checks passed **14/14** after restoring the recorded artifacts.
Dawn checks passed **7/7**. Thirty-two completed live replacements cover the new
loop's sparse/dense adjustable ties, fixed ties and maximum dimensions: four live
GPU mesh buffers, peak **1,020,912 bytes**, no retained previous buffers or new
material registrations; app/world/camera/orbit remain the same. This larger loop
workload takes about 1.3 s locally, so that test budgets two ordinary GPU intervals.

Pages browser checks passed **4/4** for immediate edits, camera retention,
keyboard/phone containment and separate asset access. A focused fifth browser
check captures and exercises full lit perspective, side/front and entry/exit
inspection using real orbit/zoom/pan input. Screenshots were inspected at
`/tmp/coasters-stage4-{perspective,side,front,entry-exit}.png`.
No desktop windows or complete pre-land suite were used. README claims and
viewport labels/helper text were not changed.
