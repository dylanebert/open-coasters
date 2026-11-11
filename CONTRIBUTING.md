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
bun test src/scene.test.ts
bun test src/scene.gpu.test.ts
bunx playwright test
bun check
```

`bun test` runs both scene tests. Dawn checks require a GPU adapter; absence is a failure, not a skip. Playwright uses Shallot's headless browser configuration and builds the Pages-path subject itself. Its `?stepped` host advances frames explicitly while sending real pointer events.

Use `bun check` for type checking. The Bun preload supplies the required shader transform; Vite uses the public Shallot plugin. Local engine links are iteration aids, not committed dependencies; verify the release pin with `bun install --frozen-lockfile`.

To inspect the production build:

```sh
bun run build
bun run preview --host 127.0.0.1
```

Visit `http://127.0.0.1:4173/open-coasters/`.
