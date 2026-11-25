import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { shallot } from "@dylanebert/shallot/vite";
export default defineConfig({ base: "./", plugins: [svelte(), shallot()] });
