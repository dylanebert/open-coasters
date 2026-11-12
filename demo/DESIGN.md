# Track inspector constraints

`src/style.css` owns the chrome's closed palette, type, spacing and state roles,
following Shallot's tool-control vocabulary. Reuse those roles, not per-control variants.
Fonts and OFL notices live in `public/fonts/`; controls import no other example's styles.

Keep the view primary and the inspector bounded, below the view on phones.
All field labels share one column.
Spacing groups related rows and separates independent sections.

History stays keyboard-only.
Asset inspection is a separate task with its own entry; `WALKTHROUGH.md` owns the URLs.
Blitz is the initial selection. Its source dimensions disable Gauge and spine
width/depth without discarding the remembered Parametric values.
Limit default-view guidance to the active assembly's dimensions and qualification limits.
Add no help control without a concrete need.
No submit action, decorative card or status badge.
Native fields retain keyboard focus and
text editing/selection; visible focus uses the gold border role. Raised resting
fields use muted hover borders, line pressed surfaces and flat bg2 disabled surfaces.

Scene materials are not chrome colors; keep the subject brighter and more saturated.
Improve composition with grid weight or framing, not by deforming the track.
Frame the track on entry and example changes without changing view direction.
Edits within an example retain orbit; all edits retain the camera entity.
Isolated assets keep their source-witness framing.
