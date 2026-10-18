import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base lets the build run from any sub-path (GitHub Pages project sites, Netlify, Cloudflare Pages…).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
