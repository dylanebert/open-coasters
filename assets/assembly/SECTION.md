# Rail section

This section is a closed polygon in local XY, measured in meters, with normal +Z
and its authored origin retained. Sixteen points sample a circle of radius
0.06 m (diameter 0.12 m); the shape is the polygon, not an analytic circle. It
supplies no bore, thickness, wall, material, normals, UVs or end treatment.

## File representation

`assembly-section.gltf` contains evaluated geometry, not the editable Blender
curve. glTF units, coordinates and indexed LINES keep their standard meaning.
Treating those lines as a section is an additional interpretation; glTF does not
define their section winding or sweep behavior.

The demo reader requires one identity-frame mesh/node in one explicitly selected
scene, with one indexed LINES primitive and POSITION only. Its index pairs must
list one closed, strictly convex, counterclockwise XY cycle in order, using each
point exactly once. This ordering was checked for this export, not assumed for
all exporters.

Coordinates are not recentered, scaled, sorted, welded or reversed. The reader
rejects nonfinite positions, broken/duplicate/out-of-range connectivity, reversed
winding, nonconvex/degenerate contours and unsupported content, including
transforms and appearance.

| Quantity | Limit |
| --- | --- |
| Local Z | Within 1e-6 m of zero; this is export noise, not longitudinal detail |
| Edge length | Greater than 2e-6 m |
| Every other vertex relative to an edge | Strictly left, with cross product greater than 1e-12 m² |
| Accessor entries | At most 4096 |
| Accessor representation | Nonsparse float32 VEC3 positions and unsigned integer indices |

External/data buffers and ordinary accessor offsets/strides are supported. This
reader is not a general glTF validator or upload boundary.

## What the demo adds

The app chooses the path, rigid station frames, rail offsets, faceted walls,
exposed flat end closure and untextured native rail/cap material. Both rails reuse
the section at every station without changing its dimensions. Ties are separately
placed static glTF meshes with native materials. Placement does not promise
welding, watertight attachment or engineering suitability. The asymmetric fitting
is a source/import example, not a public track component.

Consumer tests exercise recorded-loop force coloring outside the ordinary
controls. This adds no force or appearance input to the section and makes no
portable or export claim.

## Limits

Convexity, one contour, identity frame and no appearance are limits of this
reader, not all valid assets. Concave, disjoint, nested/hollow and open sections,
editable cubic controls, authored normals, material seams and texture coordinates
are not supported here. The convex restriction permits flat closure without
inferring filled regions or holes. Tests cover off-origin coordinates, not
arbitrary hierarchies, transforms or numeric scales.

This section does not replace or tighten the matching-end profile contract,
Modern reader or existing source examples. [Provenance](PROVENANCE.md) owns native
and independent verification and its limits.
