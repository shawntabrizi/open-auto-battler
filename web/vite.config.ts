import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import webfontDownload from 'vite-plugin-webfont-dl';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  // Download the Google Fonts referenced in index.html at build time and bundle
  // them into dist/, so the app serves fonts from its own origin — no runtime
  // request to fonts.googleapis.com (required by the Polkadot host sandbox).
  plugins: [webfontDownload(), wasm(), topLevelAwait(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'oab-client': path.resolve(__dirname, './src/wasm'),
    },
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['oab-client'],
  },
  assetsInclude: ['**/*.wasm'],
});
