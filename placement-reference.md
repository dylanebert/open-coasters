# recipe API

| Function | Result |
| --- | --- |
| <span id="sampleframes">[`sampleFrames`](construction/geometry.ts)</span> | A position and orientation at each requested distance along a path |
| <span id="instance">[`instance`](construction/geometry.ts)</span> | One placement of a part per supplied frame |
| <span id="repeat">[`repeat`](construction/repeat.ts)</span> | Placements of the same part at regular intervals from a start offset. Skips candidates outside allowed spans or inside excluded spans without restarting |
| <span id="sweep">[`sweep`](construction/sweep.ts)</span> | One placement of geometry swept from a [decoded section](construction/section.ts) through ordered [frames](construction/geometry.ts) |
| <span id="join">[`join`](construction/geometry.ts)</span> | Placements from the inputs, combined in input order |
