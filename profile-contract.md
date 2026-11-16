# Profiles

Provisional contract. A profile is a cross-section in the XY plane, measured in
meters, with origin (0, 0) and normal +Z. Keep its authored coordinates; do not
recenter or normalize them. Paths, placement, banking, spacing, caps and sweeping
belong to the consumer, not the profile.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/figures/profile-dark.png">
  <img src="assets/figures/profile-light.png" alt="An illustrative polygonal profile viewed straight-on in XY, with vertex dots, local origin O, X/Y axes and +Z pointing toward the reader.">
</picture>

*A profile describes a cross-section in its local XY frame.*
[Illustration source](site/src/profile-plate.ts)

## Shape and appearance

A profile contains closed polygonal contours that do not intersect or nest.
Each runs counterclockwise when viewed from +Z. Concave contours and collinear,
nonoverlapping consecutive edges are allowed. Holes, nested loops and open
contours are not supported.

The result is plain points and directed edges grouped into contours. Each edge
retains its material identity and two authored transverse unit normals. Adjacent
edges can share normals for smooth shading or use different normals for a hard
edge. Normals are not regenerated, averaged or forced perpendicular to the edge;
they must point into its outward half-plane.

Material indices refer to the returned core glTF material table, not substitute
colors. Primitives without a material use one appended slot with glTF defaults.
That slot stays separate from authored materials, even an identical-valued one.

## glTF files: matching ends

The first supported representation extracts a profile from the matching ends of
an uncapped, straight extrusion. This is an additional interpretation of the
mesh, not a claim that glTF defines profiles. Standard glTF units, geometry,
materials and transforms keep their usual meaning.

Files inherit the [static-part restrictions](instance-contract.md), including an
explicit selected scene, triangles, opaque untextured core materials and
file-wide rejection of animation, morph targets/weights, skins, cameras and
extensions. They also require:

- Only POSITION and authored NORMAL attributes
- No matrix/TRS properties, even identity-valued ones. Identity-frame grouping and mesh reuse are allowed; overlapping instances fail
- Exactly two distinct Z levels shared across the section. They need not straddle zero and do not define longitudinal placement
- One outward-wound quad per profile edge, split along either diagonal into two triangles
- Matching XY positions at both ends, with each edge endpoint's normal and material constant along Z

Hard seams may use separate vertices. No particular vertex order or primitive
per contour is required. Duplicate, open, branching, reversed or incomplete walls
fail. Caps, intermediate stations, bevels, longitudinal material/normal changes
and other triangles fail rather than being projected away. The uncapped and
identity-frame limits are provisional exporter restrictions, not different
transform semantics or automatic repair rules.

[`loadProfile`](demo/src/profile.ts) uses Shallot's public loader on the checked
JSON document, resolves buffers against the response URL and rejects reported
unsupported content. Files must also pass independent glTF format validation;
this reader is not a complete validator.

## Numerical limits

These are absolute limits, not scale-relative repair rules. Differences within
the tolerances count as export noise, not supported longitudinal detail.

| Quantity | Rule |
| --- | --- |
| Position matching | Componentwise tolerance 1e-6 m |
| Normal components and unit length | Tolerance 1e-5 |
| End separation and edge length | Greater than 2e-6 m |
| Nonadjacent edges | More than 1e-6 m apart, without crossing |
| Contour doubled area | Positive and greater than 1e-12 m² |
| Normal dot edge's unit outward vector | Greater than 1e-5 |

Position matching uses the first encountered point as the representative and
retains it without rounding. Ambiguous matches fail. Adjacent edges share an
endpoint; only exactly collinear backtracking is rejected there, without an
altitude or angle tolerance. Tangent and nearly tangent normals are unsupported.

## Verification

[Profile tests](demo/src/profile.test.ts) start from independently authored,
off-origin meter-scale walls with expected points, connectivity, normals and
materials. They check mismatched ends, longitudinal detail, winding,
intersections, nesting, unsupported content and both sides of the position and
normal tolerances.

[Modern profile provenance](assets/blitz-profile/PROVENANCE.md) records the
untextured external contribution's source fidelity, separate Blender construction,
comparison allowances and limits. It does not establish support for arbitrary
source attributes or sweep consumers.
