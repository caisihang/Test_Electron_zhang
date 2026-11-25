import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 版本号唯一数据源：src-tauri/tauri.conf.json
// 构建时注入 __APP_VERSION__ 全局常量，前端直接读取，无需运行时调用 Tauri API
const tauriConf = JSON.parse(
  readFileSync(fileURLToPath(new URL('./src-tauri/tauri.conf.json', import.meta.url)), 'utf-8'),
)
const APP_VERSION = tauriConf.version

// Vite 配置：端口与 README 中的 devUrl(http://localhost:1420) 保持一致
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
