# Track inspector constraints

`src/style.css` owns chrome tokens. Use the exact warm-neutral Shallot tool palette,
IBM Plex Sans 13px labels, JetBrains Mono 12px sections/numerals and 15px bold identity.
Fonts and OFL notices ship in `public/fonts/`; no example stylesheet is imported.

The view dominates a bounded 360px left inspector. At phone widths the inspector
moves below the view and scrolls within 60dvh. Fields share a 144px label allocation;
a dependency's 8px indent and 1px rail subtract from that allocation, not the field.
Use 4px related-row gaps, 8px label/field gaps, 16px body padding/section gaps,
12px vertical identity padding, and 24px desktop / 16px phone view-help insets.
Controls have 1px borders, 2px corners, 32px desktop / 44px touch targets.

Presence follows context: configuration chooses the example; track mode exposes ties
and spine; isolated mode exposes only its asset choice. Fixed ties retain a disabled
separation field and concise dependency meaning. No submit action, decorative card,
status badge or repeated explanatory block. Native fields retain keyboard focus and
text editing/selection; visible focus uses the gold border role. Raised resting
fields use muted hover borders, line pressed surfaces and flat bg2 disabled surfaces.

Scene materials are not chrome colors. Keep the subject brighter/more saturated;
the grid's public opacity is reduced rather than changing geometry for composition.
`src/track.ts` and its metric tests remain the geometric oracle.
