# Track laboratory

From `demo/`, run `bun run dev` and open the printed URL (WebGPU required).
The production Pages route is `/open-coasters/`.

1. Start with **Banked curve**: a quarter circle of radius 8 m, with a constant
   30° bank. Drag the canvas to orbit and scroll to zoom.
2. Compare **Straight** (12 m) and **Vertical loop** (3 m centerline radius).
   The loop's up direction points down at its crown; this is geometric inversion,
   not a camera effect. The closed loop has a shorter final spacing remainder.
3. Change **Tie spacing**, then press **Build configuration**. Ties are placed at
   multiples of that metric distance along the centerline, not equal chord lengths.
4. With **Provisional adjustable ties**, change rail center separation. Local ties
   change span with the rails. Rail radius remains 65 mm. Spine width and depth
   change the rectangular spine only, with its top 220 mm below the path.
5. Select **Licensed Blitz**. The original 1.2 m-wide tie stays rigid and unscaled;
   this demo fixes rail separation to 1 m for that choice. Spacing and spine controls
   remain available. Source coordinates, MIT notices and rebuild limitations live
   in `assets/blitz-tie/PROVENANCE.md` (from the repository root).
6. **Isolated asset witnesses** retains the wheel carrier and Blitz tie examples,
   each shown twice with rigid placements. These make narrower claims than a ride.

Build reloads the page, resetting the camera and disposing the previous app; it
cannot accumulate live GPU meshes with repeated edits. The form scrolls separately
from the canvas on desktop and sits below it on small screens.

All construction in `src/track.ts` is visibly provisional local demo code, not a
shared profile, recipe or asset contract. The analytic paths deliberately avoid
an editor. Sweeps use finite cross-section rings, flat face normals and open ends;
there are no supports, transitions, train clearance checks, dynamics or structural
claims. The loop is a closed geometric study, not a traversable ride layout.

Focused checks:

```sh
bun test src/track.test.ts
bun test src/track.gpu.test.ts
bunx playwright test tests/track.e2e.ts
```

The geometry tests independently check dimensions and orientation landmarks;
Dawn checks draw/removal of the generated meshes; Pages tests rebuild each
configuration and component choice and all four controls, recording screenshots
at `/tmp/coasters-track-{straight,curve,loop}.png`.
