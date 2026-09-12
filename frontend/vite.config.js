import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  // OpenCV is loaded on demand, so pre-bundle it at server startup instead of
  // letting late dependency discovery invalidate the dynamic import URL.
  optimizeDeps: {
    include: ['@techstark/opencv-js'],
  },

  server: {
    port: 5173,

    allowedHosts: [
      'localhost',
      'steel-democracy-say-deborah.trycloudflare.com',
    ],

    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});