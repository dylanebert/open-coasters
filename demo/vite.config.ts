import { defineConfig } from "vite";
import { shallot } from "@dylanebert/shallot/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({ plugins: [svelte(), shallot()] });
