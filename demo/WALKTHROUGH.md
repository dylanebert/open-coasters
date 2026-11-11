# Track inspection

From `demo/`, run `bun run dev` and open the printed URL (WebGPU required).
The production Pages route is `/open-coasters/`.

1. Start with **Banked curve**: a quarter circle of radius 8 m, banked 30°.
   Drag the view to orbit; scroll to zoom.
2. Choose **Straight** (12 m) or the force-shaped **Vertical loop**.
   Changes are immediate in the same app. Orbit, pan and zoom are retained even
   within the current task; there is no automatic reframing.
3. Edit **Spacing · m**. Ties follow metric centerline distance, not equal chords.
   The loop has separate entry/exit ends and a shorter final spacing remainder.
4. With **Adjustable**, **Gauge · m** (rail center-to-center) changes the provisional tie span.
   Rail radius remains 65 mm. Spine width and depth change only the rectangular
   spine, whose top is 220 mm below the path. The initial width is 0.28 m.
5. Choose **Blitz**. The authored 1.2 m-wide tie stays rigid and unscaled;
   Gauge becomes disabled at 1 m immediately. Spacing and spine remain editable.
   Switching back restores the remembered adjustable separation. MIT notices,
   dimensions and reuse limits are in `assets/blitz-tie/PROVENANCE.md` at the repo root.
6. Use native **Rails**, **Ties** and **Spine** color inputs to paint independently.
   Undo/Redo and Ctrl/Cmd+Z, Ctrl+Y or Cmd+Shift+Z restore configuration and paint.
   A label drag, typed session (blur or Enter), or color acceptance is one edit.
   The Blitz contribution has no authored material; track paint is viewer-owned,
   while isolated inspection retains the default glTF material.
7. Open `?asset=wheel-carrier` or `?asset=blitz-tie` separately to inspect the
   isolated metric witnesses. Each appears twice with rigid placements. Only the
   asset selector and undo/redo remain; its edits retain the app and camera. The identity link
   returns to track configuration in a new app. Zoom as needed.

Drag numeric labels horizontally to adjust, or type in their fields.
Invalid/out-of-range in-progress edits do not replace geometry; the latest valid
edit is applied on the next frame.
On phones the inspector sits below the view, with 44px targets and vertical scrolling.
The compact local visual constraints are in `DESIGN.md`.

## Runtime boundary

One `createApp`, world and camera survive all edits. A serialized loop waits for the
previous frame fence and submitted GPU work before changing mesh content; it never
resets while an encoder is open. Inputs coalesce to the latest valid selection.

Shallot 0.10.3 does not export `clearMeshes`, and `Meshes.remove` retains packed
family slices. The exported `MeshPlugin.initialize(world)` lifecycle performs the
whole-registry release and re-stages its default cube. This demo owns that entire
registry: each geometry edit destroys scene-owned entities, invokes that lifecycle between
frames and re-stages/rebinds scene meshes. Camera, lights, grid and materials survive.
Do not add another mesh producer without revisiting this ownership boundary.

Both static contributions are validated and decoded once at startup with public
`loadGltf`. The live path keeps immutable CPU meshes/transforms and registers only
used opaque material variants once, then uses public mesh/transform/material APIs.
It supports only the existing validated static subset, not general animated glTF.
The independent `createScene(url)` witness path still uses `loadGltfScene` unchanged;
GPU tests compare both isolated live renders with that path pixel-for-pixel.

Paint-only edits call `Materials.update` on stable handles without repacking,
registering materials or overwriting cached source materials. Geometry edits repack
the bounded scene and may wait for the GPU; this is not a large-editor
streaming mechanism.

## Checks

Focused commands, from `demo/`:

```sh
bun test ./src/configuration.test.ts ./src/paint.gpu.test.ts
bun run typecheck
bun test ./src/reset.gpu.test.ts ./src/live.gpu.test.ts
bun test ./src/track.test.ts ./src/loop.test.ts ./src/track.gpu.test.ts
bunx playwright test tests/history.e2e.ts tests/fields.e2e.ts --workers=1
bunx playwright test tests/track.e2e.ts tests/scene.e2e.ts --workers=1
```

## Recorded force-shaped loop

The loop was authored offline through KexEdit's force and free-roll policies, not
fitted as a geometric curve. Gravity slows it toward the crown and accelerates it
on exit; normal g falls from high to near-zero and rises again. A smooth roll pulse
separates the lower branches. It is neither a circle nor a closed layout.
`tools/LOOP.md` owns reproduction and the verification boundary.

The app reads only recorded positions/rotations and interpolates by recorded arc
length. No physics engine or sibling checkout is needed to run, build or test it.
A shared initial camera framing accommodates the larger loop; edits still never
reframe the camera. Use side and front views to inspect its teardrop and lateral
separation rather than judging clearance from a projected crossing.

Construction in `src/track.ts` remains local demo code, not a shared profile, recipe
or asset contract. Sweeps use finite rings, flat triangle normals and open ends.
The bounded geometry checks cover this track's supported controls, not train
clearance. There are no supports, runtime dynamics, structural or ride-safety
claims.
