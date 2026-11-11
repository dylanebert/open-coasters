# Track inspector constraints

`src/style.css` owns the chrome's closed palette, type, spacing and state roles,
following Shallot's tool-control vocabulary. Reuse those roles, not per-control variants.
Fonts and OFL notices live in `public/fonts/`; controls import no other example's styles.

Keep the view primary and the inspector bounded, below the view on phones.
All field labels share one column.
Spacing groups related rows and separates independent sections.

History stays keyboard-only.
Asset inspection is a separate task with its own entry; `WALKTHROUGH.md` owns the URLs.
Fixed ties disable Gauge without discarding the remembered adjustable value.
Keep secondary guidance off the default view; add no help control without a concrete need.
No submit action, decorative card or status badge.
Native fields retain keyboard focus and
text editing/selection; visible focus uses the gold border role. Raised resting
fields use muted hover borders, line pressed surfaces and flat bg2 disabled surfaces.

Scene materials are not chrome colors; keep the subject brighter and more saturated.
Improve composition with grid weight or initial framing, not changes to track geometry.
Frame the track on entry and example changes, retaining yaw and pitch.
Parameter and paint edits retain the full orbit; all edits retain the camera.
Isolated assets keep their source-witness framing.
