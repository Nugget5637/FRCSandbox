import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Renderer tests build Three.js scene graphs on the CPU and never touch a
    // GPU or the DOM, so the default Node environment is enough. Tests that
    // need a canvas are skipped; a human verifies visuals with `npm run dev`.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
