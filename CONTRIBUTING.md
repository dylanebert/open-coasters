# Contributing

From `demo/` with Bun 1.4.4 or newer:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run dev
```

Open `/open-coasters/`. WebGPU is required. Drag to orbit; scroll to zoom.

Checks, narrow to wide:

```sh
bun check
bun run test
bunx playwright test
```

Dawn checks require a GPU adapter; absence fails rather than skips. Playwright builds and serves `/open-coasters/` headlessly. Verification opens no desktop windows unless the person asks.

The Bun preload supplies the required shader transform; Vite uses the public Shallot plugin. Local engine links are iteration aids, not committed dependencies; verify the release pin with `bun install --frozen-lockfile`.

To inspect the production build:

```sh
bun run build
bun run preview --host 127.0.0.1
```

Visit `http://127.0.0.1:4173/open-coasters/`.
