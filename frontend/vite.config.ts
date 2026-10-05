import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The dev server proxies the API so the browser sees one origin, which
    // means no CORS in development and relative /api paths work everywhere.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/sitemap.xml': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/robots.txt': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the vendor code so a content or component change does not
        // invalidate the framework bundle in visitors' caches.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('motion')) return 'motion';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
