# Track inspector constraints

`src/style.css` owns the chrome's closed palette, type, spacing and state roles,
following Shallot's tool-control vocabulary. Reuse those roles, not per-control variants.
Fonts and OFL notices live in `public/fonts/`; controls import no other example's styles.

Keep the view primary and the inspector bounded, below the view on phones.
Fields share one label allocation; dependency indentation subtracts from the label,
not the field. Spacing groups related rows and separates independent sections.

Presence follows the current task: the default view exposes track configuration,
ties and spine only. Asset inspection uses a separate `?asset=wheel-carrier` or
`?asset=blitz-tie` entry with only its asset choice and an identity return link.
Fixed ties retain a disabled separation field. Keep gesture guidance and helper
paragraphs out of the view. No submit action, decorative card or status badge. Native fields retain keyboard focus and
text editing/selection; visible focus uses the gold border role. Raised resting
fields use muted hover borders, line pressed surfaces and flat bg2 disabled surfaces.

Scene materials are not chrome colors; keep the subject brighter and more saturated.
Adjust the grid's visual weight, not track geometry, to improve composition.
