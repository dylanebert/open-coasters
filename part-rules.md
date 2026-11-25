# part rule inventory

The [part contract and reference operations](part.ts) are authoritative for this
slice; this inventory records classification, not additional portable requirements.
The binding remains provisional. Another implementation need not use TypeScript.

| Current rule | Classification and retained choice |
| --- | --- |
| Metres, right-handed +Y up/+Z front, authored origin even outside geometry | Core asset meaning; no recentering, normalization, track direction, attachments or physics implied |
| Selected roots, native hierarchy and matrix/TRS, material indices and records | Core native glTF meaning; preserve rather than flatten or reinterpret |
| Static JSON `.gltf`, explicit nonempty selected scene, supplied external/data-URI buffers | Provisional binding capability; retain, no GLB added |
| Triangles, float32 non-normalized POSITION, supported strides and unsigned packed indices | Provisional binding capability; retain existing layout and payload checks |
| No animations, skinning, morph targets/weights (even zero), cameras | Provisional static capability; retain refusal throughout the document, including unselected scenes |
| No textures/images, extensions, non-opaque materials or sparse accessors | Disputed capability boundary; retain refusal, **not** a portable material/feature whitelist |
| Core metallic-roughness materials and default material | Native appearance identity, not a new material model; retain fields and primitive assignments verbatim |
| Shallot requires decomposable TRS | Consumer behavior only; not checked by the part core |
| URL fetching, dependent-resource resolution, GPU packing and resource budgets | Consumer behavior; absent from the core |

Concrete choices for review: qualify textures/alpha/extensions independently rather
than declaring them universally unsupported; decide whether static-only and
triangle-only are optional capabilities or the initial binding; qualify sparse
accessors and GLB separately. This slice changes none of these provisional refusals.
Khronos validation remains separate: the bounded gate is not a complete glTF validator.

`requireStaticInstance` is the existing document-only preflight, now inward. It
cannot validate dependent bytes or complete hierarchy validity. `nativeSnapshot`
adds those checks and returns owned immutable native data. The construction adapter
retains its branding/error API; both the demo snapshot loader and the actual
[worked command](examples/repeated-tie.ts) reach this same operation. Profiles keep
their existing preflight API; no profile or placement contract is migrated here.
