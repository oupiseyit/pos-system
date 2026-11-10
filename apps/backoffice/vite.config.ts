import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// host: true so the dev server is reachable from outside the Docker container.
// /api goes to the API: http://api:3000 in Docker (API_URL), localhost:3000 on the host.
// Built files are served by the API under /admin (09 §4); dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
}));
