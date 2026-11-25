// 应用版本号：构建时由 vite.config.ts 从 tauri.conf.json 注入
// 唯一数据源：src-tauri/tauri.conf.json 的 version 字段
// 修改版本只需改 tauri.conf.json，然后运行 npm run version:sync 同步其他文件
declare const __APP_VERSION__: string

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
