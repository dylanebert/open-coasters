# USD asset binding

USD is a delivery format for [parts](instance-contract.md) and [profile section geometry](profile-contract.md). The checks below cover static assets in standalone stages, without a renderer.

## Parts

Set the stage's `defaultPrim` to the top-level prim that represents the part. Author `metersPerUnit` as a positive finite number and `upAxis` as `Y` or `Z`; do not rely on application defaults. Evaluate the native transforms to get stage coordinates, then multiply lengths by `metersPerUnit`. For the tie check's Y-up destination, rotate Z-up coordinates to `(x, z, -y)` before placement, a right-handed rotation; leave Y-up coordinates unchanged. Do not infer a new front from bounds. Y-up is the tie check's destination, not a requirement for renderers or recipes. Keep the authored origin, root and child transforms, and native mesh topology, including polygon connectivity and winding. Resolve native material bindings to the actual bound materials; matching shader values alone do not preserve material identity.

Open the whole standalone stage before selecting the part. A material can live in a sibling scope outside the selected hierarchy: masking the [tie stage](assets/usd-tie/tie.usda) to `/Tie` loses the binding to `/_materials/TieSteel` on Blender import. The sibling scope is not part geometry.

From the repository root, use Python with OpenUSD's `pxr` bindings (tested with Python 3.14.8 and OpenUSD 26.08):

```sh
python assets/usd-tie/check-openusd.py -v
```

This [fixture-specific verifier](assets/usd-tie/check-openusd.py) checks the placed centimetre, Z-up tie, including its transformed mesh, resolved untextured material and shader inputs. It is not an upload gate for other parts. For the headless Blender export/import and byte comparison, follow the [recorded commands and versions](assets/usd-tie/PROVENANCE.md#recorded-checks). That record also owns the host-specific workaround if importing `pxr` fails with a static TLS error. Blender is not needed for the OpenUSD check.

## Sections

Declare one `Xform` as the section frame and explicitly list one or more distinct descendant `BasisCurves` prims by absolute prim path. The stage needs the same explicit units and up axis as a part. The frame transform must be invertible. For each curve point, apply the composed curve-to-stage transform, then the inverse of the composed frame-to-stage transform, then multiply by `metersPerUnit`. The section is the resulting frame-local XY; reject points more than `1e-6` m off that plane. Stage up does not rotate the section XY. The reader reports the frame's source placement separately, in the source stage axes with translation in meters.

Use static, linear curves. `curveVertexCounts` splits each prim's ordered points into separate curves; curves are returned in selection order, then in authored order within each prim. `nonperiodic` is an open polyline with at least two vertices; `periodic` is a closed polyline with at least three, joined from last to first without repeating the first vertex. Degenerate XY edges are rejected.

Run the [section checker](assets/usd-section/check_section.py) on the [fixture](assets/usd-section/section.usda) with the same Python prerequisites, from the repository root:

```sh
python assets/usd-section/check_section.py assets/usd-section/section.usda \
  /Source/Frame /Source/Frame/Strip /Source/Frame/Offset/Loops
```

To check your own section, replace the stage file, frame path and curve paths. The JSON reports ordered metric XY and closure for each curve and a separate row-vector frame-to-world matrix. To rerun the [fixture tests and negative cases](assets/usd-section/test_section.py), use `python -B assets/usd-section/test_section.py -v`.

## Limits

The section check qualifies selected curve geometry and connectivity, not filled regions or imaging of the curves themselves (including their widths and shading). The tie checks native material identity and inputs, not rendered appearance. Neither check qualifies downstream sweep or rendering. This binding does not cover cubic curves, external composition, texture or material conversion, USD recipe output, or USD loading in the Shallot demo.
