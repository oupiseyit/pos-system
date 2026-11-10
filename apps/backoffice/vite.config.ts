import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// host: true so the dev server is reachable from outside the Docker container.
// /api goes to the API: http://api:3000 in Docker (API_URL), localhost:3000 on the host.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
