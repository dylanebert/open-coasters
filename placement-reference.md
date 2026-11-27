# recipe API

| function | returns |
| --- | --- |
| <span id="sampleframes">[`sampleFrames`](construction/geometry.ts)</span>`(path, distances)` | a frame at each requested distance |
| <span id="instance">[`instance`](construction/geometry.ts)</span>`(content, frames)` | one placement per frame |
| <span id="repeat">[`repeat`](construction/repeat.ts)</span>`(content, options)` | placements at evenly spaced candidates that pass the span filters |
| <span id="sweep">[`sweep`](construction/sweep.ts)</span>`(section, frames, material)` | one placement of geometry swept from a [decoded section](construction/section.ts) through ordered [frames](construction/geometry.ts) |
| <span id="join">[`join`](construction/geometry.ts)</span>`(constructions)` | placements combined in input order |
