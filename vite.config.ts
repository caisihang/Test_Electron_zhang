import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：端口与 README 中的 devUrl(http://localhost:1420) 保持一致
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  // sql.js 是 UMD 包，交给 Vite 预构建为 ESM；wasm 由 ?url 引入
  build: {
    target: 'chrome100',
    chunkSizeWarningLimit: 2000,
  },
})
