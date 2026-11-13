# Geometry-only sampled section witness

This asset's section meaning is its metric, closed sampled polygon in local XY,
with +Z normal and the authored origin retained. The sixteen points sample a
radius .06 m circle (diameter .12 m); they are not an analytic-circle promise.
There is no bore, thickness, wall, material, normal, UV or end-treatment input.

`assembly-section.gltf` is evaluated geometry, not the editable Blender curve.
Standard glTF meters, coordinates and indexed LINES connectivity retain their
standard meanings. **Using these lines as a section is an additional, restricted
interpretation**, not native glTF sweep semantics. The demo reader accepts one
identity-frame mesh/node in one explicitly selected scene, one indexed LINES
primitive, POSITION only, one closed strictly convex CCW XY cycle. Consecutive
index pairs must serialize that directed cycle, with each point used exactly
once. This ordering/winding convention belongs to this binding; arbitrary glTF
LINES does not declare section winding or sweep behavior. It was measured for
this native export, not assumed of every exporter.

The reader retains XY values without recentering, scaling, sorting, welding or
reversing them. It refuses nonfinite positions, broken/duplicate/out-of-range
connectivity, reversed winding, nonconvex/degenerate contours and unsupported
semantic fields (including transforms and appearance). Local Z must be within
1e-6 m of zero; edges must exceed 2e-6 m and each other vertex must be strictly
left of each edge by cross product greater than 1e-12 m². Z within that tolerance
is export noise, not a supported longitudinal feature. Accessors are bounded to
4096 entries, nonsparse float32 VEC3 positions and unsigned integer indices.
External/data buffers and ordinary accessor offsets/strides are decoded; this
reader is not a general glTF validator or upload boundary.

Convexity, one contour, identity frame and no appearance are **this consumer's
bounded support**, not definitions of all valid assets. Concave, disjoint,
nested/hollow and open sections, editable cubic controls, authored normals,
material seams and texture-coordinate capabilities are not qualified here.
The convex restriction allows simple generated flat closure without inferring
filled regions or holes. Off-origin coordinates are tested; arbitrary source
hierarchies/transforms and numeric scales are not qualified by this witness.

The app separately chooses the path, rigid station frames, rail offsets,
faceted wall construction, exposed flat end closure and an explicit untextured
native material for rails and caps. It reuses the same section at every station
of both rails, without changing source dimensions. Ties are ordinary placed
static glTF meshes with native materials, not section meaning; placement
promises neither welding, watertight attachment nor engineering suitability.
The asymmetric fitting remains a native source/import witness, not a public
track component.

The recorded-loop force display is a runtime consumer operation. It adds no
force or appearance input to this section binding and makes no portable or
export claim.

This adds a scoped direct-section witness. It does not replace or tighten the
legacy matching-end profile contract, Modern gate or existing source witnesses.
See `PROVENANCE.md` for native and independent evidence and its limits.
