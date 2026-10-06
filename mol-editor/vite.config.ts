import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    // RDKit wasm 较大，放宽 chunk 警告
    chunkSizeWarningLimit: 6000,
  },
})
