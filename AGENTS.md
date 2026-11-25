# Open Coasters

`README.md` is reserved for the person's front page. Keep agent instructions here or in scoped `AGENTS.md` files, not parallel user guides.

[spec.md](spec.md) is the guide entry; its Contents list owns the reading order. `part.ts` owns the native part contract; `profile.ts` owns the provisional matching-end profile contract and recovery. Source evidence, reproduction and notices live with each asset under `assets/`.

## Development and checks

The root checks cover the inward asset contracts, recipe examples and one-tie capture poses without a renderer. From `demo/`, `bun test ./tools/normal-track.test.ts` checks native export and inspection at the command boundary.

After installing `demo/` dependencies, `bun check -p demo/tsconfig.json ./profile.ts ./profile.test.ts` checks the profile owner and assertions with the existing Bun typings.

From `demo/`, with Bun 1.4.4 or newer:

```sh
bun install --frozen-lockfile
bun run dev
```

The demo requires WebGPU. The Bun preload supplies the shader transform; Vite uses the public Shallot plugin. Local engine links are iteration aids, not committed dependencies; verify the release pin with a frozen install.

`bun run typecheck` covers Svelte components, which `bun check` does not.

Iterate on affected CPU files. `bun run test` is the cheap CPU default; exhaustive geometry (`*.node.ts`), GPU (`*.gpu.test.ts`) and browser (`*.e2e.ts`) checks are explicit tiers. Budgets come from Shallot's `testing` export.

Use CPU state or native bytes where they can decide the claim. Run an affected GPU file for a changed device/resource boundary, or one headless browser subject for changed built-page input, loading or presentation. Dawn requires an adapter. Playwright needs an installed Chromium (`bunx playwright install chromium` if missing) and tests the built `/open-coasters/` route; open no desktop windows unless the person asks.

Run explicit files with `bun test ./src/<subject>.node.ts`, `bun test ./src/<subject>.gpu.test.ts` or `bunx playwright test tests/<subject>.e2e.ts`. Full slow tiers are dispatch-only in `.github/workflows/test.yml`; run them for a named change or doubt, not every local landing.

## Spec site and figures

From `site/`, `bun install --frozen-lockfile && bun run test` checks source/output fidelity, the static HTTP boundary and committed figures without a browser or GPU.

Install `demo/` dependencies before `bun run build`. `bun run preview` serves the result. To leave an existing preview alone, pass a directory without an `open-coasters/` child to `bun run build`.

`bun run test:page` is the explicit built-page browser subject. Stop the preview before running it: the check owns its server port. Playwright's matching Chromium is the default; `CHROMIUM_PATH` selects an existing executable.

`site/package.json` lists the asset plate capture and annotation commands. Captures require a GPU; annotations reuse the raw PNGs.

For the one-tie still, build and serve `visualizer/` separately. From `visualizer/`, run `VISUALIZER_URL=<served app URL> bun run capture` on the GPU host.

Pre-land check: `bun test ./part.test.ts ./profile.test.ts ./examples/one-tie.test.ts ./examples/repeated-tie.test.ts ./visualizer/model.test.ts && cd demo && bun install --frozen-lockfile && bun check -p tsconfig.json ../profile.ts ../profile.test.ts && bun check && bun run typecheck && bun run test && bun test ./tools/normal-track.test.ts && cd ../site && bun install --frozen-lockfile && bun run test`.
