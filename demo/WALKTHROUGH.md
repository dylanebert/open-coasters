# Track inspection

From `demo/`, run `bun run dev` and open the printed URL (WebGPU required).
The production Pages route is `/open-coasters/`.

1. Start with **Banked curve**: a quarter circle of radius 8 m, banked 30°.
   Drag the view to orbit; scroll to zoom.
2. Choose **Straight** (12 m) or **Vertical loop** (3 m centerline radius).
   Changes are immediate in the same app. Orbit, pan and zoom are retained even
   across isolated/track choices; there is no automatic reframing.
3. Edit **Spacing · m**. Ties follow metric centerline distance, not equal chords.
   The closed loop has a shorter final spacing remainder.
4. With **Adjustable**, rail separation changes the provisional tie span.
   Rail radius remains 65 mm. Spine width and depth change only the rectangular
   spine, whose top is 220 mm below the path. The initial width is 0.28 m.
5. Choose **Blitz · fixed**. The authored 1.2 m-wide tie stays rigid and unscaled;
   separation becomes disabled at 1 m immediately. Spacing and spine remain editable.
   Switching back restores the remembered adjustable separation. MIT notices,
   dimensions and reuse limits are in `assets/blitz-tie/PROVENANCE.md` at the repo root.
6. Choose **Isolated instances**. Only the asset selector remains; wheel carrier
   and Blitz tie each appear twice with rigid placements. Zoom as needed: the
   camera intentionally does not jump to a different framing when the example changes.

Numbers support native keyboard editing and focus. Invalid/out-of-range in-progress
edits do not replace geometry; the latest valid edit is applied on the next frame.
On phones the inspector sits below the view, with 44px targets and vertical scrolling.
The compact local visual constraints are in `DESIGN.md`.

## Runtime boundary

One `createApp`, world and camera survive all edits. A serialized loop waits for the
previous frame fence and submitted GPU work before changing mesh content; it never
resets while an encoder is open. Inputs coalesce to the latest valid selection.

Shallot 0.10.3 does not export `clearMeshes`, and `Meshes.remove` retains packed
family slices. The exported `MeshPlugin.initialize(world)` lifecycle performs the
whole-registry release and re-stages its default cube. This demo owns that entire
registry: each edit destroys scene-owned entities, invokes that lifecycle between
frames and re-stages/rebinds scene meshes. Camera, lights, grid and materials survive.
Do not add another mesh producer without revisiting this ownership boundary.

Both static contributions are validated and decoded once at startup with public
`loadGltf`. The live path keeps immutable CPU meshes/transforms and registers only
used opaque material variants once, then uses public mesh/transform/material APIs.
It supports only the existing validated static subset, not general animated glTF.
The independent `createScene(url)` witness path still uses `loadGltfScene` unchanged;
GPU tests compare both isolated live renders with that path pixel-for-pixel.

Edits repack the bounded scene and may wait for the GPU; this is not a large-editor
streaming mechanism.

## Checks

Focused commands, from `demo/`:

```sh
bun test src/reset.gpu.test.ts src/live.gpu.test.ts
bun test src/track.test.ts src/track.gpu.test.ts
bunx playwright test tests/track.e2e.ts tests/scene.e2e.ts --workers=1
```

All construction in `src/track.ts` remains provisional local demo code, not a shared
profile, recipe or asset contract. Sweeps use finite rings, flat normals and open
ends. There are no supports, transitions, clearance checks, dynamics or structural
claims. The loop is a geometric study, not a traversable ride layout.
