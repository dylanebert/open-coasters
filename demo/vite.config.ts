import { defineConfig } from 'vite';
import { shallot } from '@dylanebert/shallot/vite';
export default defineConfig({ base: '/open-coasters/', plugins: [shallot()] });
