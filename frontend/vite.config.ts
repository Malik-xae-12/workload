import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/auth': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/fabric': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/finin': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/users': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/workspaces': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/deploy': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
