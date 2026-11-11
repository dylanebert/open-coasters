# Static instance candidate — provisional

This is a draft, not a frozen contract. The static witnesses below include one
licensed Blitz tie and a standalone Blender placement example. Richer content
and broader consumer adoption remain unproved.

An instance is a reusable bounded object, placed as a whole. Its authored local
origin is meaningful even when outside its geometry. Distances are meters in a
right-handed frame, +Y up, asset front +Z. This does not define an engine camera,
track forward, attachment, construction, profile or physics convention.

A consumer supplies each placement's translation and orientation. Placement
maps the authored local frame into the consumer's world, without recentering,
normalizing or guessing scale. Geometry follows placement × authored hierarchy
(parent before child). Reusing an asset does not mutate it or any other placement.
No required names, empty markers or custom metadata identify the origin.

## First binding: glTF 2.0, static subset

The normative geometry format is [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
particularly Coordinate System and Units, Scenes, Transformations and
Instantiation. Its meters, basis, node hierarchy and mesh reuse map directly to
the meaning above. A consumer may use a different internal frame, but conversion
must preserve these units and placement semantics.

This candidate's demo accepts JSON `.gltf` with external/data buffers, an explicit
`scene` index, triangle meshes and opaque core metallic-roughness materials without
textures. The selected subtree must contain mesh geometry; intermediate empty
grouping nodes are allowed. Only that scene's roots are instantiated, with their
authored hierarchy and transforms retained. Standard glTF matrix/TRS encoding is
retained; compositions that Shallot cannot represent as TRS are refused rather
than approximated. Placements in this example are rigid
translations and unit XYZW quaternions, without placement scale.

The contribution subset refuses animation, skins, morph targets **and weights**
(including zero weights), cameras, textures/images, non-triangle modes,
non-opaque materials and extensions. Refusals apply throughout the contribution,
not just the selected scene. Morph and animation semantics are deferred, not
silently flattened into a claim of full support. Names and extras carry no
placement semantics. No additional metadata is required.

Contributions must be valid glTF; Khronos glTF-Validator establishes the fixture's
format validity. The demo's subset gate is not a full glTF validator. The demo
decodes the JSON document it checked; relative buffer URIs resolve against the
fetched document's response URL. Shallot's public loader owns geometry decoding
and scene spawning; decoder errors and reported unsupported content fail loading.
The example is not an upload service or a new general-purpose importer.

## Inspectable examples

`assets/wheel-carrier/` contains original MIT Blender source and export instructions.
The asymmetric nose faces +Z. The demo repeats the same asset at (-1.5, 0, 0)
and (1.5, 0, 0), the latter rotated +90° about Y. Orbit and zoom expose both;
there is no assembly rule or motion model. Tests and independent Blender import
check the authored offset and metric landmarks, rather than treating two uses
of the same decoder as independent evidence.

`assets/blitz-tie/` preserves an archived MIT Modern track tie credited to Felix,
its source notices, editable Blender contribution and rebuild instructions. The
demo's Example selector retains wheel-carrier and adds this tie at the same two
rigid placements. Raw OBJ positions independently anchor its metric landmarks
and authored origin; no track-forward or assembly semantics are inferred.
`assets/blitz-tie/place-twice.py` is a standalone Blender import-and-placement
workflow, separate from its source-comparison oracle. This qualifies that static
part and those placements, not profiles, trains or the whole asset contract.
