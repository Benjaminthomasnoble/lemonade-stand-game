import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/; set BASE_PATH in CI.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
