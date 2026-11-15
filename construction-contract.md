# Construction

Provisional construction contract. Assets remain independent of construction:
[instance](instance-contract.md) and [profile](profile-contract.md) contribution
contracts are unchanged. Human demo
validation and broader release qualification remain open.

## Shared execution

The renderer-independent [kernel](construction/kernel.ts) owns graph data types,
original-text JSON parsing, immutable registries, exact nominal/list typing and
complete-call demand. Runtime data uses dense arrays and plain records with own
enumerable data properties. Accessors, hidden or symbol properties, functions and
mutable host objects are refused. Graph structure is closed and validated
throughout, including unused definitions. Only demanded calls require installed operations/types; every
input and output of a demanded group is checked. Errors distinguish structure,
unsupported, type, input, evaluation and resource failure. No partial result,
coercion, implicit list broadcast, environment query, recursion, solver or baked
fallback is supplied.

Types, signatures and examples:

- [Geometry types and primitive signatures](construction/geometry.ts)
- [Ties source](construction/ties.json) and [invocation helper](construction/ties.ts)
- [NormalTrack source](construction/normal-track.json) and
  [parameters / stationGap helper](construction/normal-track.ts)
- [Optional sweep signature and material binding](construction/sweep.ts)
- [Support source](construction/plane-supports.json),
  [installed extension](construction/plane-supports.ts) and
  [static composition source](construction/static-switch.json)

NormalTrack composes station frames, local rail offsets, two sweeps and
the Ties group. A station exclusion filters the original phase sequence; custom
parts are explicitly owned placements. The static-switch group concatenates
already selected approach, left, right and custom constructions in that order.
It generates no junction, weld, connectivity or deduplication. Branch owners must
omit the shared approach.

## Numerical meaning

Lengths are meters; path station distances are authoritative parameters, not a
claim of exact chord length or design-curve reconstruction. `fixedDistances` uses
one binary64 multiplication then one addition for `phase + k * spacing`, with
`k >= 0`, `0 <= phase < spacing`, origins in `[0,length)`. Allowed spans are a
union, exclusions win, and endpoints use direct comparisons without epsilons.
Filtering never restarts spacing. Nonprogress, overflow and exhausted host work
budgets fail atomically, never truncate.

`framesAt` accepts only the closed sampled domain, preserves station poses, uses
componentwise linear positions and shortest-arc SLERP rotations. Unit-input
acceptance is `abs(norm(q)-1) <= 1e-12`; copies are normalized and canonicalized by
the first nonzero component in W,X,Y,Z order. A negative dot flips the second
endpoint; a zero dot retains it. The dot is clamped to `[0,1]`; only a rounded dot
of one uses normalized linear weights as the small-angle limit. Transform order is
`path × local adjustment × authored native hierarchy × point`, with no placement
scale or recentering.

[Numeric fixtures](demo/src/construction/numeric.test.ts) qualify bounded analytic
cases to 1e-12 m / sign-independent quaternion-component error, not bit-identical
transcendentals, arbitrary scales or universal native-tool equivalence.

## Optional geometry and diagnostic extension

`sweepConvex` accepts the [geometry-only convex XY cycle](assets/assembly/SECTION.md),
explicit frames and selected opaque untextured core native wall/cap materials.
It is always an **OPEN** sweep with both ends capped, even if endpoint poses
coincide. No topology inference, holes, UVs, textured fidelity, smoothing,
self-intersection or clearance solution is promised. Normals and degeneracy tests
use the actual emitted float32 triangle coordinates; nonfinite triangles or
cross-product magnitude <= 1e-12 m² fail. Directed faceted walls and cap fans are
qualified on bounded straight, banked and inverted fixtures, not arbitrary folded
paths. Equal-valued but distinct selected materials retain distinct table entries.

The separately installed plane-support extension accepts only upright identity
attachments exactly 1.5 m above a horizontal +Y plane and the
[checked diagnostic box post](construction/support-native.ts): 0.1 × 1.5 × 0.1 m,
identity-authored, nonindexed twelve-triangle box. It rejects incompatible height,
orientation, geometry and terrain rather than scale or solve them. It is not an
arbitrary terrain support generator.

## Native snapshots and results

[Native adapters](construction/native.ts) own glTF JSON and **all** declared buffer
bytes before invocation. `readNative(URL)` resolves dependencies then checks the
static subset. Immutable base64 byte strings avoid mutable ArrayBuffer aliases;
`snapshotBytes` returns a fresh consumer-owned copy. No live buffer URL remains.
Runtime snapshot reference identity determines reuse; equal values or URLs do not
merge snapshots. It is not an interchange identity/hash standard.

`resolvedNative` exports ordinary glTF 2.0 JSON with embedded buffer resources,
without a recipe or parallel scene encoding. Each placement wraps the selected
scene's roots in declared order, retaining authored parent hierarchy and
transforms. Meshes, materials, accessors and buffers are copied once per snapshot
identity; distinct equal-valued snapshots stay separate. This export preserves
supported native appearance; consumer force colors are never silently added.

The first reader requires an explicit nonempty selected scene with geometry,
static TRIANGLES, float32 POSITION, supported unsigned indices, supplied buffers
and opaque untextured appearance. It refuses sparse accessors, morphs, skins,
animations, cameras, textures/images and extensions. The URL binding is JSON glTF
with explicit buffer URIs, not GLB. No subset root selector is supplied. Authored
native transforms remain verbatim: the cc.Frame quaternion tolerance is not
applied to float32-exported glTF node rotations. This gate checks finite transform
shape and rejects zero rotations, but is **not** a general glTF format or
unit-quaternion validator. Native format validity is a separate authoring check;
the demo additionally refuses transforms its renderer cannot retain as TRS.

[Independent native evidence](demo/src/construction/native-adapter.test.ts)
compares exported hierarchy/resources/material tables and raw authored bytes,
then a renderer reader against hand-computed asymmetric landmarks with multiple
selected roots and a nonidentity parent. Other fixtures separately exercise
standard source execution, missing-extension refusal, installed support execution
and explicitly selected native results. Those are three separate capabilities;
a native result never proves another tool can execute its source recipe.

## Demo consumer and qualification

The [CPU app adapter](demo/src/construction-demo.ts) evaluates NormalTrack from
explicit sampled data in [assembly.ts](demo/src/assembly.ts). It samples rails at
97 stations, a bounded visualization approximation; recorded source
poses/physics are unchanged.

The ordinary suite separates repeated ties, gap filtering, explicit supports,
rail offsets and contributed Blitz composition. Gap and support controls use a
fixed straight path. Coincident gap boundaries select no exclusion, not a
zero-length shared span. [Static-composition source/native qualification](demo/src/construction/counterexamples.test.ts)
remains separate from the ordinary menu. Blitz profile assembly is an existing
consumer, not NormalTrack conformance. Consumer fixtures exercise force coloring.

[Live rendering](demo/src/live.ts) retains immutable native content and prepared
geometry, updating only affected parameter and placement rows. The
[GPU rail producer](demo/src/rail-gpu.ts) emits standard main/position-only streams;
the CPU adapter remains its semantic oracle, not an interactive native-export
step. This is a bounded rendering adapter, not a general GPU graph evaluator.
`main.ts` serializes authoring updates between completed frames/submitted work.

[Retained-output fixtures](demo/src/retained-live.gpu.test.ts) compare actual GPU
positions/normals on the supported straight, banked and recorded paths with CPU
native results. [Producer fixtures](demo/src/rail-gpu.gpu.test.ts) check stream
agreement, bounds, ordering, aborted-draw retry and disposal. Standard draw,
depth-prepass and shadow-enabled execution are exercised without an independent
shadow-pixel oracle. Built-page cases cover controls, history, framing and phone
layout. These checks do not qualify arbitrary paths/scales, other native importers,
hosted CI, release tiers or human usefulness.
