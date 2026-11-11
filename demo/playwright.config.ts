import { defineConfig } from "@playwright/test";
import { BROWSER_CONFIG, TIMEOUT, WEB_SERVER_CONFIG } from "@dylanebert/shallot/testing";
export default defineConfig({
    ...BROWSER_CONFIG,
    testDir: "./tests",
    timeout: TIMEOUT.browser,
    use: {
        ...BROWSER_CONFIG.use,
        baseURL: "http://127.0.0.1:4173/open-coasters/",
        viewport: { width: 1280, height: 800 },
    },
    webServer: {
        ...WEB_SERVER_CONFIG,
        command: "bun run build && bun run preview --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173/open-coasters/",
    },
});
