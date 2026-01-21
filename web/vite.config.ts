import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'manalimit-core': path.resolve(__dirname, '../core/pkg')
    }
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['manalimit-core']
  },
  server: {
    fs: {
      // Allow serving files from the core/pkg directory
      allow: ['..']
    }
  },
  assetsInclude: ['**/*.wasm']
})
