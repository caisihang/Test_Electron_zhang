// Tauri 适配层：Web 预览模式下走本地实现，打包进 Tauri 后自动切换为 Rust 命令
// 说明：这里不静态引入 @tauri-apps/api，避免 Web 模式多装依赖；Tauri 2 注入 __TAURI_INTERNALS__

/** 当前是否运行在 Tauri 容器内 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 调用 Rust 命令（等价于 @tauri-apps/api/core 的 invoke） */
export async function invokeCommand<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<T> } })
    .__TAURI_INTERNALS__
  if (!internals) throw new Error('当前不是 Tauri 运行环境')
  // 保留日志，便于排查 IPC 调用问题
  console.log('[tauri] invoke', command, args)
  return internals.invoke(command, args)
}

/** 把本地绝对路径转换为可在页面里预览的 asset URL（Tauri 2） */
export function convertFileSrc(path: string): string {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { convertFileSrc: (p: string) => string } })
    .__TAURI_INTERNALS__
  if (internals?.convertFileSrc) return internals.convertFileSrc(path)
  // 兜底：Tauri 2 的 asset 协议地址
  return `http://asset.localhost/${encodeURIComponent(path)}`
}

/** 运行环境说明，用于设置页展示 */
export function runtimeLabel(): string {
  return isTauri() ? 'Tauri 桌面端' : '浏览器预览（本地 SQLite/WASM）'
}
