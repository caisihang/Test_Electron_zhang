// 版本号单一数据源同步脚本
// 唯一真相来源：src-tauri/tauri.conf.json 的 version 字段
// 同步目标：package.json / src-tauri/Cargo.toml
// 用法：node scripts/sync-version.mjs  （无参数时只检查并回写；--check 仅检查不写）

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const checkOnly = process.argv.includes('--check')

// 1. 读取 tauri.conf.json（唯一数据源）
const tauriConfPath = join(root, 'src-tauri', 'tauri.conf.json')
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'))
const version = tauriConf.version
if (!version) {
  console.error('[sync-version] tauri.conf.json 缺少 version 字段')
  process.exit(1)
}

// 2. 同步 package.json
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
if (pkg.version !== version) {
  if (checkOnly) {
    console.error(`[sync-version] package.json 版本 ${pkg.version} != tauri.conf.json ${version}`)
    process.exit(1)
  }
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  console.log(`[sync-version] package.json -> ${version}`)
}

// 3. 同步 Cargo.toml 的 [package] version
const cargoPath = join(root, 'src-tauri', 'Cargo.toml')
const cargoText = readFileSync(cargoPath, 'utf-8')
// 只替换 [package] 段下的 version（避免误伤依赖版本）
const newCargo = cargoText.replace(
  /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m,
  `$1"${version}"`,
)
if (newCargo !== cargoText) {
  if (checkOnly) {
    console.error(`[sync-version] Cargo.toml 版本 != tauri.conf.json ${version}`)
    process.exit(1)
  }
  writeFileSync(cargoPath, newCargo, 'utf-8')
  console.log(`[sync-version] Cargo.toml -> ${version}`)
}

console.log(`[sync-version] 完成，当前版本：${version}`)
