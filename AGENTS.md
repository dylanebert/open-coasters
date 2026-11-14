# Open Coasters

`README.md` is reserved for the person's front page. Keep agent instructions here or in scoped `AGENTS.md` files, not parallel user guides.

The provisional asset meanings and restrictions live in `instance-contract.md` and `profile-contract.md`; `construction-contract.md` owns construction meaning and qualified limits. Source evidence, reproduction and notices live with each asset under `assets/`.

## Development and checks

From `demo/`, with Bun 1.4.4 or newer:

```sh
bun install --frozen-lockfile
bun run dev
```

The demo requires WebGPU. The Bun preload supplies the shader transform; Vite uses the public Shallot plugin. Local engine links are iteration aids, not committed dependencies; verify the release pin with a frozen install.

`bun run typecheck` covers Svelte components, which `bun check` does not.

Iterate on affected CPU files. `bun run test` is the cheap CPU default; exhaustive geometry (`*.node.ts`), GPU (`*.gpu.test.ts`) and browser (`*.e2e.ts`) checks are explicit tiers. Budgets come from Shallot's `testing` export.

Use CPU state or native bytes where they can decide the claim. Run an affected GPU file for a changed device/resource boundary, or one headless browser subject for changed built-page input, loading or presentation. Dawn requires an adapter. Playwright requires `bunx playwright install chromium` and tests the built `/open-coasters/` route; open no desktop windows unless the person asks.

Run explicit files with `bun test ./src/<subject>.node.ts`, `bun test ./src/<subject>.gpu.test.ts` or `bunx playwright test tests/<subject>.e2e.ts`. Full slow tiers are dispatch-only in `.github/workflows/test.yml`; run them for a named change or doubt, not every local landing.

Pre-land check: `cd demo && bun install --frozen-lockfile && bun check && bun run typecheck && bun run test`.
