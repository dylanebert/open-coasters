# Open Coasters

`README.md` is reserved for the person's front page. Keep agent instructions here or in scoped `AGENTS.md` files, not parallel user guides.

The provisional asset meanings and restrictions live in `instance-contract.md` and `profile-contract.md`; source evidence, reproduction and notices live with each asset under `assets/`.

## Development and checks

From `demo/`, with Bun 1.4.4 or newer:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run dev
```

WebGPU is required. The Bun preload supplies the shader transform; Vite uses the public Shallot plugin. Local engine links are iteration aids, not committed dependencies; verify the release pin with a frozen install.

`bun run typecheck` covers Svelte components, which `bun check` does not. Dawn checks fail without a GPU adapter. Playwright tests the built `/open-coasters/` Pages route headlessly; open no desktop windows unless the person asks.

Pre-land check: `cd demo && bun install --frozen-lockfile && bun check && bun run typecheck && bun run test && bunx playwright test`.
