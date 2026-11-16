# Static parts

Provisional contract. The examples below verify specific static parts and
placements, not richer content or support across other consumers.

A static part is a reusable object placed as a whole. Its local origin stays
where the author put it, even outside the geometry. Distances are meters in a
right-handed frame, with +Y up and the asset's front facing +Z. These axes do not
define track direction, attachment points, camera behavior or physics.

Each placement supplies a translation and orientation. It preserves the part's
coordinates, size and hierarchy without recentering or normalizing. Transforms
apply in this order:

`placement × authored hierarchy (parent before child) × point`

Reusing a part does not change it or its other placements. Names and extras have
no placement meaning. No name, empty marker or custom metadata is required to
identify the origin.

## glTF files

[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) supplies the
units, axes, scene hierarchy, transforms and mesh reuse. A consumer can use other
internal axes, but must preserve those meanings when converting.

The demo supports:

- JSON `.gltf` with external or data-URI buffers and an explicit `scene` index
- A selected scene containing mesh geometry; empty grouping nodes are allowed
- Triangle meshes and opaque core metallic-roughness materials without textures
- The selected scene's roots only, with authored hierarchy and matrix/TRS transforms retained
- Rigid placements: translation and unit XYZW quaternion, without placement scale

Transforms that Shallot cannot retain as TRS are rejected, not approximated.

The following are rejected anywhere in the file, including outside the selected
scene:

- Animation, skins, morph targets and morph weights, even zero weights
- Cameras, textures, images and extensions
- Non-triangle primitives and non-opaque materials

Unsupported animation and morphs are not flattened into static geometry.
No additional metadata is required.

## Loading and validation

Contributions must be valid glTF. Use Khronos glTF-Validator for format validity;
the demo's subset check is not a full validator.

The demo decodes the same JSON document it checked. Relative buffer URIs resolve
against the fetched document's response URL. Shallot's public loader decodes the
geometry and creates the scene. Decoder errors and reported unsupported content
fail loading. This is not an upload service or a general-purpose importer.

## Examples

[Wheel carrier](assets/wheel-carrier/PROVENANCE.md) has original MIT Blender
source and export instructions. Its asymmetric nose faces +Z. At
`?asset=wheel-carrier`, it appears at (-1.5, 0, 0) and (1.5, 0, 0), with the second
placement rotated +90° around Y. Orbit and zoom show both; there is no assembly
rule or motion model. Tests and a separate Blender import compare the authored
offset and metric landmarks.

[Blitz tie](assets/blitz-tie/PROVENANCE.md) preserves Felix's archived MIT Modern
track tie, notices, editable source and rebuild instructions. At `?asset=blitz-tie`,
it uses the same placements. The Asset selector switches between these two
examples. Raw OBJ positions establish dimensions and origin independently of the
demo decoder; no track direction or assembly meaning is inferred.

[place-twice.py](assets/blitz-tie/place-twice.py) demonstrates Blender import and
placement separately from the source-comparison check. These examples verify the
parts and placements shown, not profiles, trains or the entire asset contract.
