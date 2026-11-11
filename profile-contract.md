# Planar profile candidate — provisional

A profile is an authored metric XY section with origin (0,0) and +Z normal.
Coordinates are not recentered or normalized. It is separate from the static
instance candidate: paths, placement, banking, spacing, caps and sweep algorithms
belong to consumers. This draft has only a synthetic extraction witness; neither
Modern source fidelity nor independent consumer interoperability is qualified.

Sections contain closed, disjoint, nonintersecting polygonal contours, CCW when
viewed from +Z. Holes, nested loops and open contours are unsupported. Concave
polygons and collinear nonoverlapping consecutive edges are allowed. Output is
plain points and directed edges grouped into contours. Each edge retains its
material identity and its two authored transverse unit normals. Adjacent edges
may share normals (smooth shading) or have distinct normals (hard shading).
Normals are not regenerated, averaged or forced perpendicular to an edge, but
must point strictly into its outward half-plane. Material indices refer to the
returned core glTF material table, not colors used as substitutes for identity.

## First restricted binding: matching-end glTF

Standard glTF 2.0 units, geometry, materials and transforms retain their standard
meanings. **Profile extraction** is the new interpretation, not a claim that
arbitrary glTF meshes are profiles. `demo/src/profile.ts` uses Shallot's public
loader on the checked JSON document, resolves buffers against the response URL,
and refuses decoder-reported unsupported content. Contributions must be valid
glTF independently; this boundary is not a complete format validator.

This first binding inherits the static contribution subset's explicit selected
scene, triangle-only opaque untextured core materials and document-wide refusals
of animation, morph targets/weights, skinning, cameras and extensions. It adds:

- Only POSITION and authored NORMAL attributes. No lost UV/color/tangent data.
- No authored matrix/TRS properties, even identity-valued ones. Identity-frame
  grouping and mesh reuse are allowed, but overlapping instances fail. This is
  a provisional exporter restriction, not alternate transform semantics.
- Only uncapped straight side-wall witnesses. All vertices lie on exactly two
  distinct Z levels shared across the section. The levels need not straddle zero;
  they are evidence of extrusion, not longitudinal placement output.
- Each polygon edge has exactly one outward-wound quad split by either diagonal
  into two triangles. Duplicate, open, branching, reversed or incomplete walls
  fail. Caps, intermediate stations, bevels, longitudinal material/normal changes
  and any other triangles fail rather than being projected away.
- End positions match in XY; normals and material are constant along each edge
  endpoint's Z line. Hard seams may use separate glTF vertices. There is no
  requirement for a particular vertex index layout or primitive per contour.

The uncapped/identity-frame policies deliberately limit the first witness. They
are not evidence that capped or transformed sections are inherently impossible.
Supporting those requires explicit additional semantics and tests, not fallback.

## Numerical policy

Absolute position tolerance is 1e-6 meters, normal-component and unit-length
tolerance 1e-5. Coordinates are matched componentwise to the first encountered
section point; output retains that authored representative without rounding.
Ambiguous matches fail. End separation and edge length must exceed 2e-6 m.
Nonadjacent edges must be farther than 1e-6 m; crossing and overlapping edges,
including backtracking adjacent edges, fail. Contours require positive doubled
area greater than 1e-12 square meters. The authored normal dot the edge's unit
outward vector must exceed 1e-5. Thus tangent or nearly tangent normals are
unsupported. These absolute limits are part of this candidate,
not scale-relative repair heuristics. Differences below tolerances are treated
as export noise, not as supported longitudinal features.

`demo/src/profile.test.ts` authors off-origin meter-scale walls directly, with
independent expected points, contour adjacency, hard/smooth normals and material
values. Mutations exercise end mismatch, longitudinal geometry/shading,
connectivity/winding, intersections, nesting and subset refusals, including both
sides of positional and normal matching tolerances. No live demo integration,
production profile archive, mesh bending or general import framework is included.
