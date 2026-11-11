# Contributing

Demo checks (from `demo/`, narrow to wide):

- `bun install --frozen-lockfile`
- `bun test src/scene.test.ts`
- `bun test src/scene.gpu.test.ts`
- `bunx playwright test`
- `bun check`

GPU checks require an adapter and fail when none is available. Browser checks build and preview `/open-coasters/` headlessly.
