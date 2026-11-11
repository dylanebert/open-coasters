# Track inspector constraints

`src/style.css` owns the chrome's closed palette, type, spacing and state roles,
following Shallot's tool-control vocabulary. Reuse those roles, not per-control variants.
Fonts and OFL notices live in `public/fonts/`; controls import no other example's styles.

Keep the view primary and the inspector bounded, below the view on phones.
Fields share one label allocation; dependency indentation subtracts from the label,
not the field. Spacing groups related rows and separates independent sections.

Presence follows context: configuration chooses the example; track mode exposes ties
and spine; isolated mode exposes only its asset choice. Fixed ties retain a disabled
separation field and concise dependency meaning. No submit action, decorative card,
status badge or repeated explanatory block. Native fields retain keyboard focus and
text editing/selection; visible focus uses the gold border role. Raised resting
fields use muted hover borders, line pressed surfaces and flat bg2 disabled surfaces.

Scene materials are not chrome colors; keep the subject brighter and more saturated.
Adjust the grid's visual weight, not track geometry, to improve composition.
