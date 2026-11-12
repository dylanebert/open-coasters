# Demo

## Interface

Keep the view primary and the inspector bounded, below the view on phones. Labels and units identify controls; add no explanatory copy or help control without a concrete need. Use the asset contract's terminology, including Color rather than Paint.

`src/style.css` owns the chrome's palette, type, spacing and state roles. Reuse those roles, not per-control variants. Fonts and OFL notices live in `public/fonts/`; import no other example's styles.

All field labels share one column. Spacing groups related rows and separates independent sections. History stays keyboard-only. No submit action, decorative card or status badge. Native fields retain keyboard focus and text selection; visible focus uses the gold border role.

Scene materials are not chrome colors; keep the subject brighter and more saturated. Improve composition with grid weight or framing, not by deforming the track. Frame on entry and example changes without changing view direction; other edits retain orbit and the camera entity. Isolated assets retain their source-witness framing.

## Runtime boundary

`src/live.ts` resets the entire mesh registry on geometry replacement. Do not add another mesh producer without revisiting that ownership. Serialize replacements between completed frames and submitted GPU work as in `src/main.ts`; `src/reset.gpu.test.ts` and `src/live.gpu.test.ts` check release and retained state.

Construction is app-local, not a shared asset or sweep contract. The profile and instance gates are restricted subsets, not full glTF validators. Parametric clearance checks do not qualify Blitz, train clearance, engineering attachments or ride safety.

Loop authoring and record changes: read `tools/AGENTS.md`.
