# Demo

## Interface

Keep the scene full-view, example navigation at the bottom and contextual controls bounded at the top right on desktop and phones. Labels and units identify controls; add no explanatory copy or help control without a concrete need. Use the asset contract's terminology, including Color rather than Paint.

`src/style.css` owns the chrome's palette, type, spacing and state roles. Reuse those roles, not per-control variants. Fonts and OFL notices live in `public/fonts/`; import no other example's styles.

All field labels share one column. Spacing groups related rows and separates independent sections. History stays keyboard-only. No submit action, decorative card or status badge. Native fields retain keyboard focus and text selection; visible focus uses the gold border role.

Scene materials are not chrome colors; keep the subject brighter and more saturated. Improve composition with grid weight or framing, not by deforming the track. Frame on entry and example changes without changing view direction; other edits retain orbit and the camera entity. Isolated assets retain their source-witness framing.

## Runtime boundary

`src/live.ts` owns world-local native content, materials and placement rows; `src/rail-gpu.ts` owns retained rail geometry. Registry entries live with the world, not a field edit. Clearing the registry invalidates cached handles and producer buffers.

Apply authoring updates between completed frames and submitted work as in `src/main.ts`. Rail compute uses the shared frame encoder before mesh preprocessing. `src/retained-live.gpu.test.ts` and `src/rail-gpu.gpu.test.ts` check actual GPU output, retained resources, submission and disposal.

`../construction-contract.md` owns shared construction meaning and qualified limits. The demo adapts paths, renderer packing and force colors; it does not define another placement or sweep policy. The profile and instance gates are restricted subsets, not full glTF validators. Parametric clearance checks do not qualify Blitz, train clearance, engineering attachments or ride safety.

Loop authoring and record changes: read `tools/AGENTS.md`.
