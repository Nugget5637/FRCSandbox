import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works from any static host path
  // (GitHub Pages project sites, subfolders, or opened locally).
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
