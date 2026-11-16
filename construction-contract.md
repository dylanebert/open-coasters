# Construction

Provisional contract. Construction uses [static parts](instance-contract.md)
and [profiles](profile-contract.md) without changing their contracts.

## Recipes and results

A recipe connects operations to place parts and generate geometry. Its resolved
result contains ordinary geometry and explicit placements, readable without the recipe.

NormalTrack combines path frames, local rail offsets, two sweeps and repeated
ties. Gaps filter the tie sequence. Custom parts have explicitly owned placements.

Static-switch concatenates selected approach, left, right and custom constructions,
in that order. It creates no junction, weld or connectivity and removes no
duplicates. Branch owners must omit the shared approach.

| Source | Interfaces |
| --- | --- |
| [Geometry types](construction/geometry.ts) | Shared types and primitive signatures |
| [Ties](construction/ties.json) | [Invocation](construction/ties.ts) |
| [NormalTrack](construction/normal-track.json) | [Parameters and station gap](construction/normal-track.ts) |
| [Sweep](construction/sweep.ts) | Optional operation and material binding |
| [Plane supports](construction/plane-supports.json) | [Installed extension](construction/plane-supports.ts) |
| [Static switch](construction/static-switch.json) | Static composition only |

## Execution

The renderer-independent [kernel](construction/kernel.ts) parses original JSON
text and evaluates graphs using immutable registries. Declared type names and
list types must match exactly. Runtime values use dense arrays and plain records
with own enumerable data properties. Getters/setters, hidden or symbol
properties, functions and mutable host objects are rejected.

The closed graph structure is validated, including unused definitions. Only
needed calls require installed operations/types; all their group inputs and
outputs are checked, not just selected outputs.
Errors distinguish structure, unsupported content, type, input, evaluation and
resource failures. There is no partial result, coercion, implicit list broadcast,
environment query, recursion, solver or baked fallback.

## Distances and frames

Lengths are meters. Sampled distances are authoritative, not exact chord lengths
or a reconstruction of the design curve.

`fixedDistances` computes `phase + k * spacing` with one binary64 multiplication
then one addition. It requires `k >= 0` and `0 <= phase < spacing`, with placement
origins in `[0, length)`. Allowed spans form a union; exclusions win. Endpoint
comparisons use no epsilon. Filtering never restarts spacing. Nonprogress,
overflow and exhausted host work budgets fail without returning a truncated result.

`framesAt` accepts only the closed sampled domain and preserves station poses.
Positions interpolate componentwise; rotations use shortest-arc SLERP:

- Accept unit inputs when `abs(norm(q) - 1) <= 1e-12`
- Normalize copies and canonicalize by the first nonzero component in W,X,Y,Z order
- Flip the second endpoint for a negative dot product; retain it for a zero dot
- Clamp the dot to `[0, 1]`; use normalized linear weights only when it rounds to one

Transform order is `path × local adjustment × authored hierarchy × point`, without
placement scale or recentering.

[Numeric tests](demo/src/construction/numeric.test.ts) check bounded analytic cases
to 1e-12 m / sign-independent quaternion-component error, not bit-identical
transcendentals, arbitrary scales or equivalence across native tools.

## Sweeps and supports

`sweepConvex` uses the [convex XY section](assets/assembly/SECTION.md), explicit
frames and selected opaque untextured core wall/cap materials. It always produces
an open sweep capped at both ends, even when endpoint poses coincide. Distinct
selected materials keep separate table entries even when their values match.

Normals and degeneracy checks use the emitted float32 triangle coordinates.
Nonfinite triangles or cross-product magnitude <= 1e-12 m² fail. Directed faceted
walls and cap fans are checked on bounded straight, banked and inverted examples,
not arbitrary folded paths. There is no topology inference, holes, UVs, textured
fidelity, smoothing, self-intersection solution or clearance solution.

Plane-support accepts only upright identity attachments exactly 1.5 m above a
horizontal plane with upward +Y normal and the [box post](construction/support-native.ts):
0.1 × 1.5 × 0.1 m, identity-authored, nonindexed, twelve triangles. Incompatible
height, orientation, geometry and terrain fail; it neither resizes posts nor
solves arbitrary terrain supports.

## glTF input and output

[Native adapters](construction/native.ts) own glTF JSON and all declared buffers
before evaluation. `readNative(URL)` resolves dependencies and checks the static
subset. Immutable base64 strings prevent byte aliasing; `snapshotBytes` returns
a fresh copy. No live buffer URL remains. Reuse follows snapshot object identity,
not equal values or URLs; this is not an interchange identity/hash standard.

`resolvedNative` writes glTF 2.0 JSON with embedded buffers, without a recipe or
parallel scene format. Each placement wraps the selected scene's roots in their
declared order, preserving authored hierarchy and transforms. Meshes, materials,
accessors and buffers are copied once per snapshot identity; distinct snapshots
stay separate even when equal-valued. Supported native appearance is preserved;
consumer force colors are not added silently.

The reader requires an explicit nonempty selected scene containing geometry,
static TRIANGLES, float32 POSITION, supported unsigned indices, supplied buffers
and opaque untextured appearance. It rejects sparse accessors, morphs, skins,
animation, cameras, textures/images and extensions. It accepts JSON glTF with
explicit buffer URIs, not GLB; no subset root selector is provided.

Native transforms stay verbatim; cc.Frame quaternion tolerance does not apply to
float32-exported node rotations. The reader checks finite transform fields and
their dimensions, and rejects zero rotations. It is not a general glTF or
unit-quaternion validator. Format validity is checked separately; the demo also
rejects transforms its renderer cannot retain as TRS.

[Native tests](demo/src/construction/native-adapter.test.ts) compare exported
hierarchy, resources, materials and raw bytes, then check a renderer reader
against hand-computed asymmetric landmarks with multiple roots and a nonidentity
parent. Separate fixtures check source execution, missing-extension refusal,
installed supports and selected native results. Reading a result does not prove
recipe execution.

## Demo and verification limits

Rail combines tie spacing and rail separation. Gap filters ties on the selected
path; Supports uses a fixed straight path. Coincident gap boundaries mean no
exclusion, not a zero-length shared span. Blitz uses the existing profile
consumer, not NormalTrack conformance. [Static composition](demo/src/construction/counterexamples.test.ts)
and force coloring are checked outside the ordinary controls.

The [CPU adapter](demo/src/construction-demo.ts) evaluates NormalTrack from
[sampled paths](demo/src/assembly.ts) at 97 rail stations: a visual approximation,
not a change to recorded poses or physics. [Live rendering](demo/src/live.ts)
retains native content and prepared geometry, updating affected parameters and
placement rows. The [GPU producer](demo/src/rail-gpu.ts) emits standard
main/position-only streams checked against CPU results, not interactive native
exports or general GPU graph execution. `main.ts` applies updates between
completed frames and submitted work.

[Retained-output tests](demo/src/retained-live.gpu.test.ts) compare GPU positions
and normals with CPU native results on supported straight, banked and recorded
paths. [Producer tests](demo/src/rail-gpu.gpu.test.ts) check streams, bounds,
ordering, aborted-draw retry and disposal. Standard draw, depth-prepass and
shadow-enabled execution are exercised without an independent shadow-pixel
check. Browser tests cover controls, history, framing and phone layout. None of
this qualifies arbitrary paths/scales, other native importers, hosted CI, release
tiers or human usefulness.
