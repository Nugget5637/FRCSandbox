import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works from any static host path
  // (GitHub Pages project sites, subfolders, or opened locally).
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    // Rapier's -compat build embeds its WebAssembly as base64 inside JS, so its
    // chunk is a few MB no matter what. Splitting it out means the browser can
    // load and cache physics, rendering, and app code in parallel instead of as
    // one blocking file. Raise the warning limit to match that reality.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('rapier3d')) return 'physics';
          if (id.includes('/three/')) return 'three';
          return undefined;
        },
      },
    },
  },
});
